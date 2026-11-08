import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { prepareNativeCheck } from './native-check.mjs'

// Prepare isolated QA artifacts only; caller stops Next before invoking this.
// No server, connected editor, user project or application route is mutated.
const output = path.resolve(process.argv[2] ?? 'artifacts/performance/array-interactions-20261108/build')
const metadata = await prepareNativeCheck({ entry: 'src/components/canvas/render/__tests__/browser-array-interactions.tsx', output,
  name: 'array-interactions', title: 'Chorono multi-selection array acceptance' })
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', path.join(output, 'editor-base.css'), '--minify'], { stdio: 'pipe' })
const html = path.join(output, 'array-interactions.html')
await writeFile(html, (await readFile(html, 'utf8')).replace('</head>', '<link rel="stylesheet" href="editor-base.css"></head>'))
const baseCssSha256 = createHash('sha256').update(await readFile(path.join(output, 'editor-base.css'))).digest('hex')
await writeFile(path.join(output, 'array-interactions-sources.json'), JSON.stringify({ ...metadata, baseCssSha256,
  fixtureSource: 'Deterministic inline multi-root/keyed forest; real ArrayModal, SceneCanvas, editor/history and production array adapter; no user assets.' }, null, 2))
console.log(JSON.stringify({ output, sourceFiles: metadata.sources.length, html }))
