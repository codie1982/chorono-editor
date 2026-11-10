import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

// Run in a stopped/isolated checkout. This browser fixture has no user scene,
// MCP bridge, network assets or production route; its panels are real source.
const output = path.resolve(process.argv[2] ?? 'artifacts/timeline-authoring')
await mkdir(output, { recursive: true })
await build({ entryPoints: ['src/components/timeline/authoring/__tests__/browser-timeline-authoring.tsx'], bundle: true,
  platform: 'browser', target: 'es2022', jsx: 'automatic', tsconfig: 'tsconfig.json',
  define: { 'process.env.NODE_ENV': '"production"' }, outfile: path.join(output, 'check.js'), loader: { '.wasm': 'empty' } })
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', path.join(output, 'base.css'), '--minify'], { stdio: 'pipe' })
await writeFile(path.join(output, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><title>Chorono Timeline authoring acceptance</title><link rel="stylesheet" href="base.css"></head><body><div id="app"></div><script src="check.js"></script></body></html>')
console.log(JSON.stringify({ output }))
