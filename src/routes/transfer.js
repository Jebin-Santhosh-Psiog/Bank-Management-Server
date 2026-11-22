const r = require('express').Router()
const { txns, ts, byIfsc, move, out } = require('../db')
const { bank } = require('../auth')
const call = require('../call')

const mine = (b, i) => typeof i === 'string' && i.startsWith(b.ifscPrefix)

r.post('/validate', bank, async (req, res) => {
  const { ifsc, accountNo } = req.body ?? {}
  const b = await byIfsc(ifsc)
  if (!b) return res.status(404).json({ code: 'INVALID_BANK' })
  try {
    const x = await call(b, '/interbank/validate', { ifsc, accountNo })
    res.status(x.s).json({ valid: !!x.j.valid, maskedName: x.j.maskedName ?? null })
  } catch {
    res.status(504).json({ code: 'BANK_UNREACHABLE' })
  }
})

r.post('/transfer', bank, async (req, res) => {
  const { txnId, fromIfsc, fromAccount, toIfsc, toAccount, amount } = req.body ?? {}
  if (!/^[A-Za-z0-9_-]{6,50}$/.test(txnId || '') || !fromAccount || !toAccount || !(+amount > 0))
    return res.status(400).json({ code: 'INVALID_REQUEST' })
  if (!txnId.startsWith(req.bank.bankCode + '-')) return res.status(400).json({ code: 'TXN_ID_PREFIX', reason: `txnId must start with ${req.bank.bankCode}-` })
  if (!mine(req.bank, fromIfsc)) return res.status(403).json({ code: 'IFSC_MISMATCH' })
  const to = await byIfsc(toIfsc)
  if (!to) return res.status(404).json({ code: 'INVALID_BANK' })
  const n = +amount
  try {
    await txns.doc(txnId).create({
      txnId, fromIfsc, fromAccount, toIfsc, toAccount, amount: n,
      status: 'PENDING', failureReason: null, createdAt: ts(), updatedAt: ts()
    })
  } catch (e) {
    if (e.code === 6) return res.status(409).json({ code: 'DUPLICATE_TXN' })
    throw e
  }
  let st = 'FAILED', why = 'CREDIT_FAILED'
  try {
    const x = await call(to, '/interbank/credit', {
      txnId, fromIfsc, fromAccount, toIfsc, toAccount, amount: n, timestamp: new Date().toISOString()
    })
    if (x.ok && x.j.status === 'SUCCESS') st = 'SUCCESS', why = null
    else why = x.j.reason || x.j.code || why
  } catch (e) {
    if (e.name === 'TimeoutError') st = 'PENDING', why = 'TIMEOUT'
    else why = 'BANK_UNREACHABLE'
  }
  await move(txnId, st, why)
  res.status(st === 'SUCCESS' ? 200 : st === 'PENDING' ? 202 : 422).json({ txnId, status: st, reason: why })
})

r.get('/transfers/:id', bank, async (req, res) => {
  const id = req.params.id
  const d = await txns.doc(id).get()
  if (!d.exists) return res.status(404).json({ code: 'TXN_NOT_FOUND' })
  let x = d.data()
  if (!mine(req.bank, x.fromIfsc) && !mine(req.bank, x.toIfsc)) return res.status(403).json({ code: 'FORBIDDEN' })
  if (x.status === 'PENDING') {
    try {
      const to = await byIfsc(x.toIfsc)
      const y = to && (await call(to, `/interbank/status/${id}`, null, 'GET'))
      if (y && y.ok && ['SUCCESS', 'FAILED'].includes(y.j.status))
        x = await move(id, y.j.status, y.j.status === 'FAILED' ? y.j.reason || 'CREDIT_FAILED' : null)
    } catch {}
  }
  res.json(out(x))
})

r.post('/transfers/:id/reverse', bank, async (req, res) => {
  const id = req.params.id
  const d = await txns.doc(id).get()
  if (!d.exists) return res.status(404).json({ code: 'TXN_NOT_FOUND' })
  const x = d.data()
  if (!mine(req.bank, x.fromIfsc)) return res.status(403).json({ code: 'FORBIDDEN' })
  if (!['PENDING', 'SUCCESS'].includes(x.status)) return res.json({ txnId: id, status: x.status })
  try {
    const to = await byIfsc(x.toIfsc)
    const y = await call(to, '/interbank/reverse', { txnId: id })
    if (!y.ok) return res.status(422).json({ code: 'REVERSE_FAILED', reason: y.j.reason || y.j.code || null })
    const z = await move(id, 'REVERSED', 'REVERSED_BY_SENDER', ['PENDING', 'SUCCESS'])
    res.json({ txnId: id, status: z.status })
  } catch {
    res.status(504).json({ code: 'BANK_UNREACHABLE' })
  }
})

module.exports = r
