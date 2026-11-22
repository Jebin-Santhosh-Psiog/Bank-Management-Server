require('dotenv').config()
const express = require('express')

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '50kb' }))

app.get('/x42/health', (req, res) => res.json({ status: 'UP', time: new Date().toISOString() }))
app.use('/x42/banks', require('./routes/banks'))
app.use('/x42', require('./routes/transfer'))

app.use((req, res) => res.status(404).json({ code: 'NOT_FOUND' }))
app.use((e, req, res, next) => {
  if (e.type === 'entity.parse.failed') return res.status(400).json({ code: 'INVALID_JSON' })
  console.error(e)
  res.status(500).json({ code: 'INTERNAL_ERROR' })
})

const p = process.env.PORT || 8080
if (require.main === module) app.listen(p, () => console.log(`X42 switch on :${p}`))

module.exports = app
