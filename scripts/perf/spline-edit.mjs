import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { prepareNativeCheck } from './native-check.mjs'

// Stop Next first; independent native acceptance origin, no user scene changes.
const output = path.resolve(process.argv[2] ?? 'artifacts/spline-edit')
const metadata = await prepareNativeCheck({ entry: 'src/components/splineEdit/__tests__/browser-spline-edit.tsx', output,
  name: 'spline-edit', title: 'Chorono S2D-2 regression acceptance', format: 'esm' })
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', path.join(output, 'editor-base.css'), '--minify'], { stdio: 'pipe' })
const html = path.join(output, 'spline-edit.html')
await writeFile(html, (await readFile(html, 'utf8')).replace('</head>', '<link rel="stylesheet" href="editor-base.css"></head>'))
await writeFile(path.join(output, 'spline-edit-sources.json'), JSON.stringify(metadata, null, 2))
console.log(JSON.stringify({ output, sources: metadata.sources.length, html }))
