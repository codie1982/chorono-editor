import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { prepareNativeCheck } from './native-check.mjs'

// Prepare only with Next stopped; runs actual UI/native IO in a private QA origin.
const output = path.resolve(process.argv[2] ?? 'artifacts/image-paint')
const metadata = await prepareNativeCheck({ entry: 'src/components/paint/__tests__/browser-image-paint.tsx', output,
  format: 'esm', name: 'image-paint', title: 'Chorono image paint acceptance' })
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', path.join(output, 'editor-base.css'), '--minify'], { stdio: 'pipe' })
const html = path.join(output, 'image-paint.html')
await writeFile(html, (await readFile(html, 'utf8')).replace('</head>', '<link rel="stylesheet" href="editor-base.css"></head>'))
await writeFile(path.join(output, 'image-paint-sources.json'), JSON.stringify(metadata, null, 2))
console.log(JSON.stringify({ output, sources: metadata.sources.length, html }))
