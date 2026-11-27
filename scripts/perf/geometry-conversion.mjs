import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { prepareNativeCheck } from './native-check.mjs'

// Stop Next before running this standalone production-component acceptance build.
const output = path.resolve(process.argv[2] ?? '/tmp/chorono-conversion-qa')
const metadata = await prepareNativeCheck({ entry: 'src/components/canvas/render/__tests__/browser-geometry-conversion.tsx',
  output, name: 'geometry-conversion', title: 'Chorono Convert acceptance' })
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', path.join(output, 'editor-base.css'), '--minify'], { stdio: 'pipe' })
const html = path.join(output, 'geometry-conversion.html')
await writeFile(html, (await readFile(html, 'utf8')).replace('</head>', '<link rel="stylesheet" href="editor-base.css"></head>'))
await writeFile(path.join(output, 'geometry-conversion-sources.json'), JSON.stringify(metadata, null, 2))
console.log(JSON.stringify({ output, html, sources: metadata.sources.length }))
