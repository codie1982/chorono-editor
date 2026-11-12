import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

// Exercise the actual running Next receiver using only the existing synthetic
// D1 acceptance fixture. The caller owns server/config lifecycle. Re-running
// after a normal server restart proves persisted idempotency without new data.
const directory = path.resolve(process.argv[2] ?? 'artifacts/validation/diagnostics-d1-20261110')
const base = new URL(process.argv[3] ?? 'http://127.0.0.1:2000')
const filename = process.argv[4] ?? 'http-acceptance.json'
if (!['http:', 'https:'].includes(base.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
  || base.username || base.password || base.pathname !== '/' || base.search || base.hash
  || !/^[a-z0-9-]+\.json$/.test(filename)) throw new Error('This acceptance script permits only a loopback receiver and local artifact filename.')

const depotFile = path.join(directory, 'depot/state.json')
const before = JSON.parse(await readFile(depotFile, 'utf8'))
const group = before.groups?.[0], receipt = before.receipts?.[0]
if (before.groups?.length !== 1 || before.receipts?.length !== 1 || group?.summary?.occurrenceCount !== 2
  || group.summary.failureSite !== 'viewport.object-move.commit' || group.summary.appVersion !== '0.2.0'
  || group.summary.channel !== 'local' || group.summary.buildId !== 'local'
  || group.example?.operation !== 'move' || group.example?.outcome !== 'commit-failed'
  || !/^[a-f0-9-]{36}$/.test(receipt?.reportId ?? '')) throw new Error('Expected the isolated code-only synthetic D1 fixture; refusing other depot data.')

const report = { schemaVersion: 1, reportId: receipt.reportId, ...group.summary, sample: group.example }
const headers = { Origin: 'http://127.0.0.1:4346', 'Content-Type': 'application/json',
  'X-Chorono-Diagnostics-Policy': 'summary-v1' }
const canary = 'SYNTHETIC_CANARY_DO_NOT_STORE'
const checks = []

/** A failed check is retained in the artifact, without a raw response dump. */
function check(name, passed, evidence) { checks.push({ name, passed: Boolean(passed), evidence }) }

/** Fixed localhost paths and finite deadlines; no credentials or redirects.
 * Bodies are synthetic reports only. Responses contain public fixed categories. */
async function call(route, method = 'POST', value) {
  const response = await fetch(new URL(route, base), { method, headers,
    body: method === 'POST' ? JSON.stringify(value) : undefined,
    credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: AbortSignal.timeout(8000) })
  let bytes = 0
  const stream = response.body?.pipeThrough(new TransformStream({ transform(chunk, controller) {
    bytes += chunk.byteLength
    if (bytes > 4096) throw new Error('Unexpected receiver response size.')
    controller.enqueue(chunk)
  } }))
  const source = stream ? await new Response(stream).text() : ''
  let body = null
  try { body = source ? JSON.parse(source) : null } catch { /* A wrong/HTML route fails its status/body check. */ }
  return { status: response.status, body }
}

try {
  const duplicate = await call('/api/diagnostics/reports', 'POST', report)
  check('Existing report ACKs as duplicate over real HTTP', duplicate.status === 200 && duplicate.body?.accepted === true
    && duplicate.body?.duplicate === true && duplicate.body?.reportId === report.reportId, { status: duplicate.status, duplicate: duplicate.body?.duplicate })

  const afterDuplicate = JSON.parse(await readFile(depotFile, 'utf8'))
  check('Duplicate preserves persisted count and receipt cardinality', afterDuplicate.groups?.[0]?.summary?.occurrenceCount === 2
    && afterDuplicate.receipts?.length === 1, { count: afterDuplicate.groups?.[0]?.summary?.occurrenceCount, receipts: afterDuplicate.receipts?.length })

  const conflict = await call('/api/diagnostics/reports', 'POST', { ...report, occurrenceCount: 3 })
  check('Same ID with changed delta returns409', conflict.status === 409, { status: conflict.status })

  const unknown = await call('/api/diagnostics/reports', 'POST', { ...report, secret: canary })
  check('Unknown private field is rejected with400', unknown.status === 400, { status: unknown.status })

  const oversize = await call('/api/diagnostics/reports', 'POST', { ...report, secret: 'x'.repeat(16 * 1024) })
  check('Actual JSON bytes above16KiB return413', oversize.status === 413, { status: oversize.status })

  const version = await call('/api/diagnostics/version', 'GET')
  check('Consented version GET returns configured0.2.1', version.status === 200 && version.body?.version === '0.2.1',
    { status: version.status, version: version.body?.version })

  const source = await readFile(depotFile, 'utf8'), after = JSON.parse(source)
  check('Rejected requests leave only the original synthetic summary', after.groups?.length === 1 && after.receipts?.length === 1
    && after.groups[0].summary.occurrenceCount === 2 && !source.includes(canary),
  { groups: after.groups?.length, receipts: after.receipts?.length, count: after.groups?.[0]?.summary?.occurrenceCount, canaryAbsent: !source.includes(canary) })
} catch (error) {
  check('Actual HTTP acceptance completed', false, { category: error?.name ?? 'Error' })
}

const result = { testedAt: new Date().toISOString(), baseUrl: base.origin, syntheticFixture: true,
  scriptSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
  passed: checks.length === 7 && checks.every(item => item.passed), checks }
await writeFile(path.join(directory, filename), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ passed: result.passed, checks: checks.filter(item => item.passed).length,
  total: checks.length, artifact: path.join(directory, filename) }))
if (!result.passed) process.exitCode = 1
