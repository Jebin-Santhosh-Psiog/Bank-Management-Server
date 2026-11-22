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

const byIfsc = async i => {
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(i || '')) return null
  const d = await banks.doc(i.slice(0, 4)).get()
  return d.exists && d.data().status === 'ACTIVE' ? d.data() : null
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

module.exports = { db, ts, banks, txns, byIfsc, move, out }
