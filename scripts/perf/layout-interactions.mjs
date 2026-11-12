import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { prepareNativeCheck } from './native-check.mjs'

// Build isolated QA artifacts; caller owns stopping Next and serving output.
// Connected editors, user projects and application routes remain untouched.
const output = path.resolve(process.argv[2] ?? 'artifacts/performance/layout-interactions-20261108/build')
const metadata = await prepareNativeCheck({ entry: 'src/components/canvas/render/__tests__/browser-layout-interactions.tsx', output,
  name: 'layout-interactions', title: 'Chorono gap and ruler-guide acceptance' })
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', path.join(output, 'editor-base.css'), '--minify'], { stdio: 'pipe' })
const html = path.join(output, 'layout-interactions.html')
await writeFile(html, (await readFile(html, 'utf8')).replace('</head>', '<link rel="stylesheet" href="editor-base.css"></head>'))
const baseCssSha256 = createHash('sha256').update(await readFile(path.join(output, 'editor-base.css'))).digest('hex')
await writeFile(path.join(output, 'layout-interactions-sources.json'), JSON.stringify({ ...metadata, baseCssSha256,
  fixtureSource: 'Deterministic nearest-neighbor rectangle/group/key fixtures; real SceneCanvas, editor, selection, key commands, gaps and ruler guides; no user assets.' }, null, 2))
console.log(JSON.stringify({ output, sourceFiles: metadata.sources.length, html }))
