const crypto = require('crypto')
const { banks } = require('./db')

const hash = k => crypto.createHash('sha256').update(k).digest('hex')
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
const deny = res => res.status(401).json({ code: 'UNAUTHORIZED' })

const admin = (req, res, next) => {
  const k = req.get('x-admin-key') || ''
  return process.env.ADMIN_KEY && same(k, process.env.ADMIN_KEY) ? next() : deny(res)
}

const bank = async (req, res, next) => {
  const k = req.get('x-api-key'), c = (req.get('x-bank-id') || '').toUpperCase()
  if (!k || !c) return deny(res)
  const d = await banks.doc(c).get()
  if (!d.exists) return deny(res)
  const b = d.data()
  if (b.status !== 'ACTIVE' || !same(b.apiKeyHash, hash(k))) return deny(res)
  req.bank = b
  next()
}

const newKey = () => crypto.randomBytes(24).toString('hex')

module.exports = { admin, bank, hash, newKey }
