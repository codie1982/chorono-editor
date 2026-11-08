import { build } from 'esbuild'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'

// Focused CPU comparison, not whole-editor / renderer / 512 MiB resource acceptance.
const root = process.cwd(), output = path.resolve(process.argv[2] ?? 'artifacts/performance/opt9-runtime-20261107')
const sourcePath = 'src/lib/runtime/lifecycleEmitter.ts', fixturePath = 'projects/chorono-four-seasons-48s-v1.chorono.json'
const before = await readFile(path.join(output, 'lifecycle-before.ts.txt'), 'utf8')
const after = await readFile(sourcePath, 'utf8'), bytes = await readFile(fixturePath)
await mkdir(output, { recursive: true })
const require = createRequire(import.meta.url), engines = {}, sources = new Map()
for (const [name, contents] of [['before', before], ['after', after]]) {
  const outfile = path.join(output, `lifecycle-${name}.cjs`)
  const result = await build({ stdin: { contents, resolveDir: path.join(root, 'src/lib/runtime'), loader: 'ts', sourcefile: `${name}-lifecycle.ts` },
    bundle: true, platform: 'node', target: 'node20', format: 'cjs', metafile: true, tsconfig: 'tsconfig.json', outfile })
  engines[name] = require(outfile)
  for (const file of Object.keys(result.metafile.inputs)) {
    if (!file.endsWith('-lifecycle.ts')) sources.set(file, digest(await readFile(file)))
  }
}
const scene = JSON.parse(bytes)
const times = [0, 1000, 8000, 16000, 24000, 36000, 47999, 48000, 16000, 16000, 0, 48000]
const empty = engines.before.emptySnapshot()
const cases = scene.timelines.flatMap(timeline => {
  const snapshots = times.map((timeMs, i) => ({ ...empty, timeMs, isPlaying: true, activeTimelineId: timeline.id,
    activeSegmentId: i % 3 ? null : 'test-segment', loopCount: i > 7 ? 1 : 0,
    visibleLayerIds: engines.before.computeVisibleLayerIds(scene, timeMs) }))
  return snapshots.map((next, i) => [i ? snapshots[i - 1] : empty, next])
})
const equality = cases.map(([prev, next], index) => {
  const a = JSON.stringify(engines.before.detectLifecycleEvents(scene, prev, next))
  const b = JSON.stringify(engines.after.detectLifecycleEvents(scene, prev, next))
  if (a !== b) throw new Error(`Lifecycle event/order mismatch in case ${index}`)
  return { index, timelineId: next.activeTimelineId, timeMs: next.timeMs, events: JSON.parse(a).length, sha256: digest(a) }
})
// Warm both independently; ABBA order is alternated again in each round.
for (const engine of Object.values(engines)) for (const pair of cases) engine.detectLifecycleEvents(scene, ...pair)
const samples = { before: [], after: [] }, memory = { before: [], after: [] }
for (let round = 0; round < 4; round++) {
  for (const name of round % 2 ? ['after', 'before', 'before', 'after'] : ['before', 'after', 'after', 'before']) {
    const engine = engines[name]
    for (const [prev, next] of cases) {
      const start = performance.now()
      engine.detectLifecycleEvents(scene, prev, next)
      samples[name].push({ timelineId: next.activeTimelineId, timeMs: next.timeMs, ms: performance.now() - start })
    }
    memory[name].push(process.memoryUsage())
  }
}
const summarize = items => {
  const ordered = items.map(sample => sample.ms).sort((a, b) => a - b)
  return { count: ordered.length, p50Ms: ordered[Math.floor(ordered.length * .5)], p95Ms: ordered[Math.ceil(ordered.length * .95) - 1], maxMs: ordered.at(-1) }
}
const report = { scope: 'Node lifecycle event computation only; not renderer/UI/FPS or managed-memory acceptance',
  environment: { node: process.version, arch: process.arch, os: os.release(), execArgv: process.execArgv },
  fixture: { path: fixturePath, sha256: digest(bytes), layers: scene.layers.length, tracks: scene.timelines.reduce((n, timeline) => n + timeline.tracks.length, 0) },
  sources: { before: digest(before), after: digest(after), dependencies: Object.fromEntries(sources) },
  equality, summary: Object.fromEntries(scene.timelines.map(timeline => [timeline.id, Object.fromEntries(
    ['before', 'after'].map(name => [name, summarize(samples[name].filter(sample => sample.timelineId === timeline.id))]))])), samples, memory }
await writeFile(path.join(output, 'lifecycle-comparison.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ equality: equality.length, summary: report.summary }))

/** Hash exact source/event bytes, with no normalization or serialized scene mutation. */
function digest(input) { return createHash('sha256').update(input).digest('hex') }
