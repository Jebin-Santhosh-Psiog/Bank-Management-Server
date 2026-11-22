const r = require('express').Router()
const { banks, ts, IFSC } = require('../db')
const { admin, bank, hash, newKey } = require('../auth')

const ID = /^[A-Z0-9]{2,10}$/
const URL_OK = u => /^https?:\/\//.test(u || '')

r.post('/register', admin, async (req, res) => {
  const { bankId, bankName, ifsc, baseUrl } = req.body ?? {}
  if (!ID.test(bankId || '') || !bankName || !IFSC.test(ifsc || '') || (baseUrl && !URL_OK(baseUrl)))
    return res.status(400).json({ code: 'INVALID_REQUEST' })
  if (!(await banks.where('ifsc', '==', ifsc).limit(1).get()).empty)
    return res.status(409).json({ code: 'DUPLICATE_IFSC' })
  const k = newKey()
  try {
    await banks.doc(bankId).create({
      bankId, bankName, ifsc, baseUrl: baseUrl || null,
      apiKeyHash: hash(k), status: baseUrl ? 'ACTIVE' : 'INACTIVE', createdAt: ts()
    })
  } catch (e) {
    if (e.code === 6) return res.status(409).json({ code: 'DUPLICATE_BANK' })
    throw e
  }
  res.status(201).json({ bankId, ifsc, status: baseUrl ? 'ACTIVE' : 'INACTIVE', apiKey: k })
})

r.patch('/:id', admin, async (req, res) => {
  const { baseUrl, status } = req.body ?? {}
  const u = {}
  if (baseUrl !== undefined) {
    if (!URL_OK(baseUrl)) return res.status(400).json({ code: 'INVALID_REQUEST' })
    u.baseUrl = baseUrl
  }
  if (['ACTIVE', 'INACTIVE'].includes(status)) u.status = status
  const ref = banks.doc(req.params.id)
  const d = await ref.get()
  if (!d.exists) return res.status(404).json({ code: 'INVALID_BANK' })
  if (u.status === 'ACTIVE' && !(u.baseUrl || d.data().baseUrl)) return res.status(400).json({ code: 'BASE_URL_REQUIRED' })
  await ref.update(u)
  res.json({ bankId: req.params.id, ...u })
})

r.post('/:id/rotate-key', admin, async (req, res) => {
  const ref = banks.doc(req.params.id)
  if (!(await ref.get()).exists) return res.status(404).json({ code: 'INVALID_BANK' })
  const k = newKey()
  await ref.update({ apiKeyHash: hash(k) })
  res.json({ bankId: req.params.id, apiKey: k })
})

r.get('/', bank, async (req, res) => {
  const s = await banks.where('status', '==', 'ACTIVE').get()
  res.json(s.docs.map(d => ({ bankId: d.id, bankName: d.data().bankName, ifsc: d.data().ifsc })))
})

module.exports = r
