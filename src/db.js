const admin = require('firebase-admin')

const b = process.env.FIREBASE_SA_BASE64
admin.initializeApp({
  credential: b
    ? admin.credential.cert(JSON.parse(Buffer.from(b, 'base64').toString()))
    : admin.credential.applicationDefault()
})

const db = admin.firestore()
const ts = () => admin.firestore.FieldValue.serverTimestamp()
const banks = db.collection('banks')
const txns = db.collection('transactions')

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/

const byIfsc = async i => {
  if (!IFSC.test(i || '')) return null
  const s = await banks.where('ifsc', '==', i).limit(1).get()
  if (s.empty) return null
  const b = s.docs[0].data()
  return b.status === 'ACTIVE' && b.baseUrl ? b : null
}

const move = (id, to, why = null, from = ['PENDING']) =>
  db.runTransaction(async t => {
    const ref = txns.doc(id)
    const d = await t.get(ref)
    if (!d.exists) return null
    const x = d.data()
    if (!from.includes(x.status)) return x
    t.update(ref, { status: to, failureReason: why, updatedAt: ts() })
    return { ...x, status: to, failureReason: why }
  })

const out = x => {
  const t = v => (v && v.toDate ? v.toDate().toISOString() : v ?? null)
  return { ...x, createdAt: t(x.createdAt), updatedAt: t(x.updatedAt) }
}

module.exports = { db, ts, banks, txns, byIfsc, move, out, IFSC }
