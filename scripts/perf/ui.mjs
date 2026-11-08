import { build } from 'esbuild'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const root = process.cwd(), output = path.resolve(process.argv[2] ?? 'artifacts/performance/opt7-ui-20261107')
await mkdir(output, { recursive: true })
const fixtures = JSON.parse(await readFile('src/lib/resources/benchmark/fixtures.json', 'utf8'))
const inputs = []
for (const id of ['vector-visible', 'shared-image', 'mixed']) {
  const fixture = fixtures.find(fixture => fixture.id === id), source = path.join(root, 'projects', `${fixture.project}.chorono.json`)
  const bytes = await readFile(source)
  await copyFile(source, path.join(output, `${id}.chorono.json`))
  inputs.push({ id, sha256: digest(bytes) })
}
const bundle = await build({ absWorkingDir: root, entryPoints: ['src/components/virtualization/__tests__/browser-ui-check.tsx'],
  bundle: true, platform: 'browser', target: 'es2022', minify: true, metafile: true, jsx: 'automatic', tsconfig: 'tsconfig.json',
  define: { 'process.env.NODE_ENV': '"production"' }, outfile: path.join(output, 'ui-check.js') })
// Compile the actual project utility CSS after UI source changes, with Next stopped.
execFileSync(path.join(root, 'node_modules/.bin/tailwindcss'), ['-i', 'src/app/globals.css', '-o', path.join(output, 'ui-base.css'), '--minify'], { stdio: 'pipe' })
const sources = []
for (const file of Object.keys(bundle.metafile.inputs).sort()) sources.push({ path: file, sha256: digest(await readFile(file)) })
await writeFile(path.join(output, 'ui-sources.json'), JSON.stringify({ preparedAt: new Date().toISOString(), fixtures: inputs,
  bundleSha256: digest(await readFile(path.join(output, 'ui-check.js'))),
  baseCssSha256: digest(await readFile(path.join(output, 'ui-base.css'))),
  componentCssSha256: digest(await readFile(path.join(output, 'ui-check.css'))), sources }, null, 2))
await writeFile(path.join(output, 'ui-check.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Chorono UI virtualization</title><link rel="stylesheet" href="ui-base.css"><link rel="stylesheet" href="ui-check.css"></head><body><div id="app"></div><script src="ui-check.js"></script></body></html>')
console.log(JSON.stringify({ output, sourceFiles: sources.length }))

/** Exact source identity for dirty-worktree browser proof. */
function digest(bytes) { return createHash('sha256').update(bytes).digest('hex') }
