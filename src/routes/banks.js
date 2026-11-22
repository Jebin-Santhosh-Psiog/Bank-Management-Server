const r = require('express').Router()
const { banks, ts } = require('../db')
const { admin, bank, hash, newKey } = require('../auth')

r.post('/register', admin, async (req, res) => {
  const { bankCode, bankName, baseUrl } = req.body ?? {}
  if (!/^[A-Z]{4}$/.test(bankCode || '') || !bankName || !/^https?:\/\//.test(baseUrl || ''))
    return res.status(400).json({ code: 'INVALID_REQUEST' })
  const k = newKey()
  try {
    await banks.doc(bankCode).create({
      bankCode, bankName, ifscPrefix: bankCode + '0', baseUrl,
      apiKeyHash: hash(k), status: 'ACTIVE', createdAt: ts()
    })
  } catch (e) {
    if (e.code === 6) return res.status(409).json({ code: 'DUPLICATE_BANK' })
    throw e
  }
  res.status(201).json({ bankCode, ifscPrefix: bankCode + '0', apiKey: k })
})

r.patch('/:code', admin, async (req, res) => {
  const { baseUrl, status } = req.body ?? {}
  const u = {}
  if (baseUrl) u.baseUrl = baseUrl
  if (['ACTIVE', 'INACTIVE'].includes(status)) u.status = status
  const ref = banks.doc(req.params.code)
  if (!(await ref.get()).exists) return res.status(404).json({ code: 'INVALID_BANK' })
  await ref.update(u)
  res.json({ bankCode: req.params.code, ...u })
})

r.post('/:code/rotate-key', admin, async (req, res) => {
  const ref = banks.doc(req.params.code)
  if (!(await ref.get()).exists) return res.status(404).json({ code: 'INVALID_BANK' })
  const k = newKey()
  await ref.update({ apiKeyHash: hash(k) })
  res.json({ bankCode: req.params.code, apiKey: k })
})

r.get('/', bank, async (req, res) => {
  const s = await banks.where('status', '==', 'ACTIVE').get()
  res.json(s.docs.map(d => ({ bankCode: d.id, bankName: d.data().bankName, ifscPrefix: d.data().ifscPrefix })))
})

module.exports = r
