import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
if (args.length > 1) throw new Error('Usage: npm run perf:prepare -- [output-directory]')
const output = path.resolve(args[0] ?? path.join(root, 'artifacts/performance/opt0-20261107/build'))

/** Stable exact-source digest; commit alone cannot identify a dirty working tree. */
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

/** Reads static identities only; animation authoring/generation never runs through Node. */
async function fixtureDefinitions() {
  const definitions = JSON.parse(await readFile(path.join(root, 'src/lib/resources/benchmark/fixtures.json'), 'utf8'))
  if (!Array.isArray(definitions) || !definitions.length || definitions.length > 100
    || definitions.some(fixture => !/^[a-zA-Z0-9_-]+$/.test(fixture.id)
      || !/^[a-zA-Z0-9_-]+$/.test(fixture.project) || !Number.isInteger(fixture.layers) || fixture.layers < 1 || fixture.layers > 5000)) {
    throw new Error('Invalid benchmark manifest')
  }
  return definitions
}

/** Copies immutable portable inputs, validates their count and records the original byte hash. */
async function prepareFixtures() {
  const fixtures = []
  for (const fixture of await fixtureDefinitions()) {
    const source = path.join(root, 'projects', `${fixture.project}.chorono.json`)
    const bytes = await readFile(source).catch(() => { throw new Error(`Missing MCP-authored fixture: ${fixture.project}; see docs/tr/performance-baseline.md`) })
    const scene = JSON.parse(bytes)
    if (scene.layers.length !== fixture.layers) throw new Error(`Fixture layer count changed: ${fixture.id}`)
    if (scene.assets.some(asset => !asset.url.startsWith('data:'))) throw new Error(`Fixture has external/unportable media: ${fixture.id}`)
    const file = `${fixture.id}.chorono.json`
    await copyFile(source, path.join(output, file))
    fixtures.push({ ...fixture, file, sha256: hash(bytes), sourceBytes: bytes.length })
  }
  return fixtures
}

/** Builds an isolated browser test bundle; no production route, pairing token or scene is exposed. */
async function main() {
  await mkdir(output, { recursive: true })
  const fixtures = await prepareFixtures()
  const bundle = await build({ absWorkingDir: root, entryPoints: [path.join(root, 'src/lib/resources/benchmark/__tests__/browser-baseline.tsx')],
    bundle: true, platform: 'browser', format: 'iife', target: 'es2022', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' }, minify: true, metafile: true,
    tsconfig: path.join(root, 'tsconfig.json'), outfile: path.join(output, 'baseline.js') })
  const inputs = Object.keys(bundle.metafile.inputs).sort()
  const inputDigests = []
  for (const input of inputs) inputDigests.push({ path: input, sha256: hash(await readFile(path.resolve(root, input))) })
  const metadata = {
    preparedAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    dirtyWorkingTree: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).length > 0,
    sourceHash: hash(JSON.stringify(inputDigests)), bundleSha256: hash(await readFile(path.join(output, 'baseline.js'))),
    nodeVersion: process.version, platform: os.platform(), release: os.release(), architecture: os.arch(),
    physicalMemoryBytes: os.totalmem(), logicalCpuCount: os.cpus().length,
  }
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ schemaVersion: 1, build: metadata, fixtures }, null, 2))
  await writeFile(path.join(output, 'source-inputs.json'), JSON.stringify(inputDigests, null, 2))
  await writeFile(path.join(output, 'index.html'), '<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Chorono OPT0 baseline</title></head><body><script src="baseline.js"></script></body></html>')
  console.log(JSON.stringify({ output, fixtures: fixtures.length, build: metadata }))
}

await main()
