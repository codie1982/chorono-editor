import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

// Build in an isolated checkout or while its Next server is stopped. Production
// panels and a dedicated synthetic scene; no bridge or user's source included.
const output = path.resolve(process.argv[2] ?? 'artifacts/editor-hierarchy')
await mkdir(output, { recursive: true })
await build({ entryPoints: ['src/components/layerHierarchy/__tests__/browser-editor-hierarchy.tsx'],
  bundle: true, platform: 'browser', target: 'es2022', jsx: 'automatic', tsconfig: 'tsconfig.json',
  define: { 'process.env.NODE_ENV': '"production"' }, outfile: path.join(output, 'check.js'), loader: { '.wasm': 'empty' } })
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', path.join(output, 'base.css'), '--minify'], { stdio: 'pipe' })
await writeFile(path.join(output, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><title>Chorono editor hierarchy acceptance</title><link rel="stylesheet" href="base.css"><link rel="stylesheet" href="check.css"></head><body><div id="app"></div><script src="check.js"></script></body></html>')
console.log(JSON.stringify({ output }))
