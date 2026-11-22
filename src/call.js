module.exports = async (b, p, body, m = 'POST') => {
  const r = await fetch(b.baseUrl.replace(/\/$/, '') + p, {
    method: m,
    headers: { 'content-type': 'application/json', 'x-switch-key': process.env.SWITCH_KEY || '' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(+process.env.BANK_TIMEOUT_MS || 10000)
  })
  const j = await r.json().catch(() => ({}))
  return { ok: r.ok, s: r.status, j }
}
