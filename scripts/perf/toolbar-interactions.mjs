import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

// Real UI components with synthetic scene/history; no user-editor connection.
const output = path.resolve(process.argv[2] ?? 'artifacts/toolbar-interactions')
await mkdir(output, { recursive: true })
await build({ entryPoints: ['src/components/TopToolbar/__tests__/browser-toolbar.tsx'], bundle: true,
  platform: 'browser', target: 'es2022', jsx: 'automatic', tsconfig: 'tsconfig.json',
  define: { 'process.env.NODE_ENV': '"production"' }, outfile: path.join(output, 'check.js'), loader: { '.wasm': 'empty' } })
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', path.join(output, 'base.css'), '--minify'], { stdio: 'pipe' })
await writeFile(path.join(output, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><title>Chorono toolbar acceptance</title><link rel="stylesheet" href="base.css"></head><body><div id="app"></div><script src="check.js"></script></body></html>')
console.log(JSON.stringify({ output }))
