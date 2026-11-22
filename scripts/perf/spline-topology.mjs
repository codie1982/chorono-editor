import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { prepareNativeCheck } from './native-check.mjs'

// Stop Next first; private origin only, never the user's scene/session.
const output = path.resolve(process.argv[2] ?? 'artifacts/spline-topology')
const check = process.argv[3] ?? 'topology'
if (!['topology', 'attach'].includes(check)) throw new Error('Choose topology or attach acceptance.')
const name = `spline-${check}`
const metadata = await prepareNativeCheck({ entry: `src/components/splineEdit/__tests__/browser-${name}.tsx`, output,
  name, title: check === 'attach' ? 'Chorono Add Spline acceptance' : 'Chorono S2D-2 topology acceptance', format: 'esm' })
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', path.join(output, 'editor-base.css'), '--minify'], { stdio: 'pipe' })
const html = path.join(output, `${name}.html`)
await writeFile(html, (await readFile(html, 'utf8')).replace('</head>', '<link rel="stylesheet" href="editor-base.css"></head>'))
await writeFile(path.join(output, `${name}-sources.json`), JSON.stringify(metadata, null, 2))
console.log(JSON.stringify({ output, sources: metadata.sources.length, html }))
