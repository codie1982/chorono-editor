import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { prepareNativeCheck } from './native-check.mjs'

// Stop Next first; private origin only, never the user's scene/session.
const output = path.resolve(process.argv[2] ?? 'artifacts/spline-topology')
const metadata = await prepareNativeCheck({ entry: 'src/components/splineEdit/__tests__/browser-spline-topology.tsx', output,
  name: 'spline-topology', title: 'Chorono S2D-2 topology acceptance', format: 'esm' })
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', path.join(output, 'editor-base.css'), '--minify'], { stdio: 'pipe' })
const html = path.join(output, 'spline-topology.html')
await writeFile(html, (await readFile(html, 'utf8')).replace('</head>', '<link rel="stylesheet" href="editor-base.css"></head>'))
await writeFile(path.join(output, 'spline-topology-sources.json'), JSON.stringify(metadata, null, 2))
console.log(JSON.stringify({ output, sources: metadata.sources.length, html }))
