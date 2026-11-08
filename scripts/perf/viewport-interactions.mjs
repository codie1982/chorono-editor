import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { prepareNativeCheck } from './native-check.mjs'

// Standalone QA artifacts only. Invoke after stopping Next, like other native
// editor acceptance builders; the script neither starts nor stops any server.
const output = path.resolve(process.argv[2] ?? 'artifacts/performance/viewport-interactions-20261108/build')
const metadata = await prepareNativeCheck({
  entry: 'src/components/canvas/render/__tests__/browser-viewport-interactions.tsx', output,
  name: 'viewport-interactions', title: 'Chorono viewport interaction acceptance',
})
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', path.join(output, 'editor-base.css'), '--minify'], { stdio: 'pipe' })
const htmlPath = path.join(output, 'viewport-interactions.html')
await writeFile(htmlPath, (await readFile(htmlPath, 'utf8')).replace('</head>', '<link rel="stylesheet" href="editor-base.css"></head>'))
const baseCssSha256 = createHash('sha256').update(await readFile(path.join(output, 'editor-base.css'))).digest('hex')
await writeFile(path.join(output, 'viewport-interactions-sources.json'), JSON.stringify({ ...metadata, baseCssSha256,
  fixtureSource: 'Deterministic inline native scenes; no user project or remote assets.' }, null, 2))
console.log(JSON.stringify({ output, sourceFiles: metadata.sources.length, html: path.join(output, 'viewport-interactions.html') }))
