import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { prepareNativeCheck } from './native-check.mjs'

// Standalone QA preparation only. The caller stops Next before invoking this;
// no server, connected scene or application route is started or changed here.
const output = path.resolve(process.argv[2] ?? 'artifacts/performance/motion-key-interactions-20261108/build')
const metadata = await prepareNativeCheck({ entry: 'src/components/canvas/render/__tests__/browser-motion-keys.tsx', output,
  name: 'motion-key-interactions', title: 'Chorono motion key native acceptance' })
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', path.join(output, 'editor-base.css'), '--minify'], { stdio: 'pipe' })
const html = path.join(output, 'motion-key-interactions.html')
await writeFile(html, (await readFile(html, 'utf8')).replace('</head>', '<link rel="stylesheet" href="editor-base.css"></head>'))
const baseCssSha256 = createHash('sha256').update(await readFile(path.join(output, 'editor-base.css'))).digest('hex')
await writeFile(path.join(output, 'motion-key-interactions-sources.json'), JSON.stringify({ ...metadata, baseCssSha256,
  fixtureSource: 'Deterministic inline reflected/animated parent, sparse x/y keys, actual TimelinePanel/CurveEditor/SceneCanvas, no user assets.' }, null, 2))
console.log(JSON.stringify({ output, sourceFiles: metadata.sources.length, html }))
