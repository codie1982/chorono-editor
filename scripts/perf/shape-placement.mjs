import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { prepareNativeCheck } from './native-check.mjs'

// Build isolated production-control QA; caller owns server/build lifecycle.
const output = path.resolve(process.argv[2] ?? 'artifacts/performance/shape-placement-menu-20261109/build')
const metadata = await prepareNativeCheck({ entry: 'src/components/canvas/render/__tests__/browser-shape-placement.tsx', output,
  name: 'shape-placement', title: 'Chorono shape placement and crosshair acceptance' })
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', path.join(output, 'editor-base.css'), '--minify'], { stdio: 'pipe' })
const html = path.join(output, 'shape-placement.html')
await writeFile(html, (await readFile(html, 'utf8')).replace('</head>', '<link rel="stylesheet" href="editor-base.css"></head>'))
const baseCssSha256 = createHash('sha256').update(await readFile(path.join(output, 'editor-base.css'))).digest('hex')
await writeFile(path.join(output, 'shape-placement-sources.json'), JSON.stringify({ ...metadata, baseCssSha256,
  fixtureSource: 'Isolated native persistent LayerPanel Add palette, SceneCanvas, editor/history, registry templates, Pan-to-creation and crosshair; no user assets.' }, null, 2))
console.log(JSON.stringify({ output, sourceFiles: metadata.sources.length, html }))
