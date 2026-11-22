require('dotenv').config()

const url = process.env.X42_URL || `http://localhost:${process.env.PORT || 8080}`
const A = { bankId: 'T901', bankName: 'Test Bank A (mock)', ifsc: 'TSTA0000001', baseUrl: process.env.MOCK_A_URL || 'http://localhost:9001' }
const B = { bankId: 'T902', bankName: 'Test Bank B (mock)', ifsc: 'TSTB0000001', baseUrl: process.env.MOCK_B_URL || 'http://localhost:9002' }

const req = async (m, p, body, h = {}) => {
  const r = await fetch(url + p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: body && JSON.stringify(body) })
  return { s: r.status, j: await r.json() }
}
const adm = { 'x-admin-key': process.env.ADMIN_KEY }

const key = async b => {
  const x = await req('POST', '/x42/banks/register', b, adm)
  if (x.s === 201) return x.j.apiKey
  return (await req('POST', `/x42/banks/${b.bankId}/rotate-key`, null, adm)).j.apiKey
}

const ok = (n, c) => console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`) || c

const go = async () => {
  const ka = await key(A)
  await key(B)
  const h = { 'x-bank-id': 'T901', 'x-api-key': ka }
  const id = 'T901-' + Date.now()
  const t = { txnId: id, fromIfsc: 'TSTA0000001', fromAccount: '100001', toIfsc: 'TSTB0000001', toAccount: '100002', amount: 500 }
  const r = [
    ok('health', (await req('GET', '/x42/health')).j.status === 'UP'),
    ok('bad key rejected', (await req('GET', '/x42/banks', null, { ...h, 'x-api-key': 'nope' })).s === 401),
    ok('directory lists T902', (await req('GET', '/x42/banks', null, h)).j.some(b => b.bankId === 'T902')),
    ok('validate returns masked name', (await req('POST', '/x42/validate', { ifsc: 'TSTB0000001', accountNo: '100002' }, h)).j.maskedName === 'T**t C******r'),
    ok('transfer succeeds', (await req('POST', '/x42/transfer', t, h)).j.status === 'SUCCESS'),
    ok('duplicate txnId rejected', (await req('POST', '/x42/transfer', t, h)).s === 409),
    ok('status is SUCCESS', (await req('GET', `/x42/transfers/${id}`, null, h)).j.status === 'SUCCESS'),
    ok('wrong account fails', (await req('POST', '/x42/transfer', { ...t, txnId: id + 'X', toAccount: '999' }, h)).j.reason === 'INVALID_ACCOUNT'),
    ok('cannot send from another bank IFSC', (await req('POST', '/x42/transfer', { ...t, txnId: id + 'Y', fromIfsc: 'TSTB0000001' }, h)).s === 403),
    ok('txnId without bank prefix rejected', (await req('POST', '/x42/transfer', { ...t, txnId: 'NOPREFIX123' }, h)).s === 400),
    ok('rupee decimals rejected (paise only)', (await req('POST', '/x42/transfer', { ...t, txnId: id + 'Z', amount: 10.5 }, h)).s === 400),
    ok('reverse works', (await req('POST', `/x42/transfers/${id}/reverse`, null, h)).j.status === 'REVERSED')
  ]
  console.log(`\n${r.filter(Boolean).length}/${r.length} passed`)
  process.exit(r.every(Boolean) ? 0 : 1)
}

go()
