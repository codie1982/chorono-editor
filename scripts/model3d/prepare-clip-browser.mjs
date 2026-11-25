import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

// Isolated loopback fixture follows the existing model/detail acceptance host.
const output = process.argv[2] ?? '/private/tmp/chorono-3dt2-browser'
await mkdir(output, { recursive: true })
await build({ entryPoints: ['src/lib/model3d/__tests__/browser-clip-frames.tsx'], bundle: true, platform: 'browser', format: 'esm', target: 'es2022', jsx: 'automatic',
  tsconfig: 'tsconfig.json', define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' }, outfile: `${output}/check.js`, loader: { '.wasm': 'empty' } })
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', `${output}/style.css`, '--minify'])
await writeFile(`${output}/index.html`, '<!doctype html><html><head><meta charset="utf-8"><title>Chorono 3D-T2 acceptance</title><link rel="stylesheet" href="style.css"></head><body><div id="app"></div><script type="module" src="check.js"></script></body></html>')
console.log(output)
