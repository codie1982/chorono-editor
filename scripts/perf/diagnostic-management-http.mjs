import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import assert from 'node:assert/strict'

// Loopback-only real HTTP acceptance. Static code-only fixtures contain no user
// scene. The generated test credential is read from a private file, never URL,
// stdout, artifact or request body. Production issue mutation uses the real API.
const [mode = 'seed', address = 'http://127.0.0.1:2001', target = 'artifacts/validation/diagnostics-d2-20261110'] = process.argv.slice(2)
const base = new URL(address), output = path.resolve(target)
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.username || base.password || base.search || base.hash) throw Error('Loopback QA origin required')
if (!['seed', 'check', 'final'].includes(mode)) throw Error('Unknown QA mode')
const token = (await readFile(process.env.CHORONO_D2_ADMIN_TOKEN_FILE ?? '', 'utf8')).trim()
if (token.length < 32 || token.length > 256 || /[^\x21-\x7e]/.test(token)) throw Error('Private QA token required')
const { version } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))
const checks = []
await mkdir(output, { recursive: true })

/** Bound each request; errors never print credentials or arbitrary response text. */
async function call(route, { method = 'GET', admin = true, body, origin = base.origin } = {}) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(new URL(route, base), { method, signal: controller.signal,
      headers: { ...(admin ? { Authorization: `Bearer ${token}` } : {}), Origin: origin,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(!admin && method === 'POST' ? { 'X-Chorono-Diagnostics-Policy': 'summary-v1' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) })
    const text = await response.text()
    assert(!text.includes(token), 'Credential must not be echoed')
    return { status: response.status, data: text ? JSON.parse(text) : null, cache: response.headers.get('cache-control') }
  } finally { clearTimeout(timeout) }
}
/** Keep the test artifact small and code-only; no auth headers are retained. */
function record(name, evidence) { checks.push({ name, passed: true, evidence }) }
const issuePath = '/api/diagnostics/issues'

if (mode === 'seed') {
  const now = Date.now(), today = new Date(now).toISOString().slice(0, 10), yesterday = new Date(now - 86400000).toISOString().slice(0, 10)
  const common = { schemaVersion: 1, appVersion: version, buildId: 'local', channel: 'local',
    errorCode: 'EDIT_COMMIT_FAILED', module: 'viewport', classification: 'known', severity: 'error',
    failureSite: 'viewport.object-move.commit', sample: { operation: 'move', outcome: 'commit-failed' } }
  const reports = [
    { ...common, reportId: randomUUID(), day: yesterday, occurrenceCount: 7 },
    { ...common, reportId: randomUUID(), day: today, occurrenceCount: 5 },
    { ...common, reportId: randomUUID(), day: today, occurrenceCount: 3,
      failureSite: 'viewport.shape-placement.commit', sample: { operation: 'shape-placement', outcome: 'commit-failed' } },
    { ...common, reportId: randomUUID(), day: today, occurrenceCount: 1,
      errorCode: 'RENDER_FAILED', module: 'application', severity: 'fatal', failureSite: 'application.render-failed',
      sample: { operation: 'application', outcome: 'render-failed' } },
    { ...common, appVersion: '0.2.1', reportId: randomUUID(), day: today, occurrenceCount: 2 },
  ]
  for (const report of reports) assert.equal((await call('/api/diagnostics/reports', { method: 'POST', admin: false, body: report })).status, 200)
  const duplicate = await call('/api/diagnostics/reports', { method: 'POST', admin: false, body: reports[0] })
  assert.equal(duplicate.data.duplicate, true)
  await writeFile(path.join(output, 'synthetic-reports.json'), JSON.stringify(reports, null, 2))
  record('Five code-only deltas seeded; duplicate did not recount', { reports: reports.length })
}

assert.equal((await call(issuePath, { admin: false })).status, 401)
record('Anonymous management read denied', { status: 401 })
const page = await call(issuePath)
assert.equal(page.status, 200); assert.equal(page.cache, 'no-store'); assert.equal(page.data.total, 4)
const move = page.data.items.find(row => row.appVersion === version && row.failureSite === 'viewport.object-move.commit')
assert.equal(move?.occurrenceCount, 12)
assert.equal(page.data.items.filter(row => row.failureSite === 'viewport.object-move.commit').length, 2)
record('Two days combine into one12-occurrence row; releases stay separate', { total: page.data.total, occurrenceCount: move.occurrenceCount })
assert.equal((await call(issuePath + '?status=bogus')).status, 400)
assert.equal((await call(issuePath + '?limit=1000')).status, 400)
assert.equal((await call(issuePath + '?token=forbidden')).status, 400)
record('Invalid filters and URL credential fields rejected', { status: 400 })
const otherVersion = await call(issuePath + '?appVersion=0.2.1')
assert.equal(otherVersion.data.total, 1)
record('Version filter preserves exact release boundary', { total: otherVersion.data.total })

if (mode !== 'final') {
  const issue = page.data.items.find(row => row.failureSite === 'viewport.shape-placement.commit')
  const patch = (status, expectedRevision, extra = {}) => call(issuePath, { method: 'PATCH', body: { key: issue.key, status, expectedRevision, ...extra } })
  const first = await patch('investigating', issue.revision)
  assert.equal(first.status, 200); assert.equal(first.data.issue.status, 'investigating')
  const conflict = await patch('fixed', issue.revision)
  assert.equal(conflict.status, 409)
  const fixed = await patch('fixed', first.data.issue.revision)
  assert.equal(fixed.data.issue.status, 'fixed')
  const filtered = await call(issuePath + '?status=fixed')
  assert(filtered.data.items.some(row => row.key === issue.key))
  assert.equal((await patch('new', fixed.data.issue.revision, { note: 'not allowed' })).status, 400)
  const foreign = await call(issuePath, { method: 'PATCH', origin: 'https://foreign.example', body: { key: issue.key, status: 'new', expectedRevision: fixed.data.issue.revision } })
  assert.equal(foreign.status, 403)
  assert.equal((await patch('new', fixed.data.issue.revision)).data.issue.status, 'new')
  record('All three states, stale revision, unknown metadata and foreign origin checked', { conflict: 409, invalid: 400, foreign: 403 })
} else {
  assert.equal(move.status, 'investigating')
  assert.equal(page.data.items.find(row => row.failureSite === 'application.render-failed')?.status, 'fixed')
  record('Browser triage survives server restart', { move: 'investigating', render: 'fixed' })
}
const final = await call(issuePath)
assert.equal(final.data.items.reduce((sum, row) => sum + row.occurrenceCount, 0), 18)
record('Status edits preserve occurrence totals', { totalOccurrences: 18 })
const file = path.join(output, `http-${mode}.json`)
await writeFile(file, JSON.stringify({ passed: true, checks }, null, 2))
console.log(JSON.stringify({ passed: true, checks: checks.length, artifact: file }))
