import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

// Same flat loopback fixture protocol as the renderer/model acceptance hosts.
const output = process.argv[2] ?? '/private/tmp/chorono-detail-browser'
await mkdir(output, { recursive: true })
await build({ entryPoints: ['src/components/detail/__tests__/browser-detail.tsx'], bundle: true, platform: 'browser', format: 'esm', target: 'es2022', jsx: 'automatic',
  tsconfig: 'tsconfig.json', define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' }, outfile: `${output}/check.js`, loader: { '.wasm': 'empty' } })
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', `${output}/style.css`, '--minify'])
await writeFile(`${output}/index.html`, '<!doctype html><html><head><meta charset="utf-8"><title>Chorono detail acceptance</title><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="check.css"></head><body><div id="app"></div><script type="module" src="check.js"></script></body></html>')
console.log(output)
