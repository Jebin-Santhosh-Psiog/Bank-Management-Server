require('dotenv').config()
const fs = require('fs')

const url = process.env.X42_URL || `http://localhost:${process.env.PORT || 8080}`
const list = JSON.parse(fs.readFileSync(process.argv[2] || 'banks.json', 'utf8'))

const go = async () => {
  const rows = ['bankId,managedBy,bankName,ifsc,status,apiKey,result']
  for (const b of list) {
    const r = await fetch(`${url}/x42/banks/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': process.env.ADMIN_KEY },
      body: JSON.stringify({ bankId: b.bankId, bankName: b.bankName, ifsc: b.ifsc, baseUrl: b.baseUrl || undefined })
    })
    const j = await r.json()
    rows.push([b.bankId, `"${b.managedBy || ''}"`, `"${b.bankName}"`, b.ifsc, j.status || '', j.apiKey || '', j.code || r.status].join(','))
    console.log(b.bankId, b.ifsc, r.status, j.code || 'OK')
  }
  fs.writeFileSync('keys.csv', rows.join('\n'))
  console.log('API keys written to keys.csv - send each bank only its own key, never commit this file')
}

go()
