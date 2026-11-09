import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { prepareNativeCheck } from './native-check.mjs'

// Build isolated production-control QA; caller owns Next/static-server lifecycle.
const output = path.resolve(process.argv[2] ?? 'artifacts/performance/pointer-release-audit-20261109/build')
// A local Git source override makes the same browser fixture reproduce an older
// ownership policy without changing the checkout or claiming current-source hashes.
const sourcePath = 'src/components/canvas/interactions/PointerGestureSession.ts'
const sourceRef = process.argv.find(value => value.startsWith('--pointer-source-ref='))?.split('=')[1]
const oldSource = sourceRef ? execFileSync('git', ['show', `${sourceRef}:${sourcePath}`], { encoding: 'utf8' }) : null
const overrideHash = oldSource ? createHash('sha256').update(oldSource).digest('hex') : null
const plugins = oldSource ? [{ name: 'historical-pointer-owner', setup(build) {
  build.onLoad({ filter: /[\\/]PointerGestureSession\.ts$/ }, () => ({ contents: oldSource, loader: 'ts', resolveDir: path.dirname(path.resolve(sourcePath)) }))
} }] : []
const metadata = await prepareNativeCheck({ entry: 'src/components/canvas/render/__tests__/browser-pointer-release.tsx', output,
  name: 'pointer-release', title: 'Chorono pointer release audit', plugins,
  metadata: sourceRef ? { sourceOverrides: [{ path: sourcePath, gitRef: sourceRef, sha256: overrideHash }] } : {} })
if (sourceRef) metadata.sources = metadata.sources.map(source => source.path === sourcePath ? { ...source, sha256: overrideHash } : source)
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', path.join(output, 'editor-base.css'), '--minify'], { stdio: 'pipe' })
const html = path.join(output, 'pointer-release.html')
await writeFile(html, (await readFile(html, 'utf8')).replace('</head>', '<link rel="stylesheet" href="editor-base.css"></head>'))
const baseCssSha256 = createHash('sha256').update(await readFile(path.join(output, 'editor-base.css'))).digest('hex')
await writeFile(path.join(output, 'pointer-release-sources.json'), JSON.stringify({ ...metadata, baseCssSha256,
  fixtureSource: 'Production canvas/source/Pan/guide/property adapters; isolated first-release, consumed-Pan-up, foreign-pointer and focused-input checks.' }, null, 2))
console.log(JSON.stringify({ output, sourceFiles: metadata.sources.length, html }))
