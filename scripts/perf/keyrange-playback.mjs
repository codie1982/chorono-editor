import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { prepareNativeCheck } from './native-check.mjs'

// Stop Next before preparation. Reuses the standalone native acceptance builder.
const output = path.resolve(process.argv[2] ?? 'artifacts/keyrange-playback')
await prepareNativeCheck({ entry: 'src/components/timeline/authoring/__tests__/browser-keyrange-playback.tsx', output,
  name: 'keyrange-playback', title: 'Chorono key range playback acceptance' })
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', path.join(output, 'editor-base.css'), '--minify'], { stdio: 'pipe' })
const html = path.join(output, 'keyrange-playback.html')
await writeFile(html, (await readFile(html, 'utf8')).replace('</head>', '<link rel="stylesheet" href="editor-base.css"></head>'))
console.log(JSON.stringify({ output, html }))
