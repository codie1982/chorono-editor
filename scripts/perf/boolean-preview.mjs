import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { prepareNativeCheck } from './native-check.mjs'

// Actual worker + production controls on a disposable origin; stop Next first.
const output = path.resolve(process.argv[2] ?? 'artifacts/boolean-preview')
const worker = await prepareNativeCheck({ entry: 'src/lib/geometry/boolean/boolean.worker.ts', output, format: 'esm', name: 'boolean-worker', title: 'Boolean worker' })
const metadata = await prepareNativeCheck({ entry: 'src/components/booleanPreview/__tests__/browser-boolean-preview.tsx', output, format: 'esm', name: 'boolean-preview', title: 'Chorono S2D-3 Boolean preview acceptance', metadata: { worker } })
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', path.join(output, 'editor-base.css'), '--minify'], { stdio: 'pipe' })
const html = path.join(output, 'boolean-preview.html')
await writeFile(html, (await readFile(html, 'utf8')).replace('</head>', '<link rel="stylesheet" href="editor-base.css"></head>'))
await writeFile(path.join(output, 'boolean-preview-sources.json'), JSON.stringify(metadata, null, 2))
console.log(JSON.stringify({ output, sources: metadata.sources.length, workerSources: worker.sources.length, html }))
