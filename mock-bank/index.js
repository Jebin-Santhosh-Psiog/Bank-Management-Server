require('dotenv').config()
const express = require('express')

const code = process.argv[2] || process.env.MOCK_BANK_CODE || 'ABCB'
const p = +process.argv[3] || +process.env.MOCK_PORT || 9001
const accts = {
  '100001': { name: 'Jebin Santhosh', bal: 1000 },
  '100002': { name: 'Test Customer', bal: 1000 }
}
const txns = {}

const mask = n => n.split(' ').map(w => (w.length < 3 ? w[0] + '*' : w[0] + '*'.repeat(w.length - 2) + w.at(-1))).join(' ')

const app = express()
app.use(express.json())
app.use('/interbank', (req, res, next) =>
  req.get('x-switch-key') === (process.env.SWITCH_KEY || '') ? next() : res.status(401).json({ code: 'UNAUTHORIZED' }))

app.post('/interbank/validate', (req, res) => {
  const a = accts[req.body?.accountNo]
  res.json(a ? { valid: true, maskedName: mask(a.name) } : { valid: false, maskedName: null })
})

app.post('/interbank/credit', (req, res) => {
  const { txnId, toAccount, amount } = req.body ?? {}
  if (txns[txnId]) return res.json({ status: txns[txnId].status })
  const a = accts[toAccount]
  if (!a) return res.status(422).json({ status: 'FAILED', reason: 'INVALID_ACCOUNT' })
  a.bal += +amount
  txns[txnId] = { status: 'SUCCESS', acct: toAccount, amount: +amount }
  res.json({ status: 'SUCCESS' })
})

app.get('/interbank/status/:id', (req, res) => {
  const t = txns[req.params.id]
  t ? res.json({ status: t.status }) : res.status(404).json({ status: 'NOT_FOUND' })
})

app.post('/interbank/reverse', (req, res) => {
  const t = txns[req.body?.txnId]
  if (!t) return res.status(404).json({ status: 'NOT_FOUND' })
  if (t.status === 'SUCCESS') accts[t.acct].bal -= t.amount, t.status = 'REVERSED'
  res.json({ status: t.status })
})

app.get('/debug/accounts', (req, res) => res.json(accts))

app.listen(p, () => console.log(`Mock bank ${code} on :${p}`))
