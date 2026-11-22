require('dotenv').config()
const fs = require('fs')

const url = process.env.X42_URL || `http://localhost:${process.env.PORT || 8080}`
const list = JSON.parse(fs.readFileSync(process.argv[2] || 'banks.json', 'utf8'))

const go = async () => {
  const rows = ['bankCode,bankName,ifscPrefix,apiKey,result']
  for (const b of list) {
    const r = await fetch(`${url}/x42/banks/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': process.env.ADMIN_KEY },
      body: JSON.stringify(b)
    })
    const j = await r.json()
    rows.push([b.bankCode, b.bankName, j.ifscPrefix || '', j.apiKey || '', j.code || r.status].join(','))
    console.log(b.bankCode, r.status, j.code || 'OK')
  }
  fs.writeFileSync('keys.csv', rows.join('\n'))
  console.log('API keys written to keys.csv - send each bank only its own key, never commit this file')
}

go()
