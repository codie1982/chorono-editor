import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
const output = '/private/tmp/chorono-model3d-browser'
await mkdir(output, { recursive: true })
await build({ entryPoints: ['src/lib/model3d/__tests__/browser-model3d.tsx'], bundle: true, platform: 'browser', format: 'esm', target: 'es2022', jsx: 'automatic', tsconfig: 'tsconfig.json', define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' }, outfile: `${output}/check.js`, loader: { '.wasm': 'empty' } })
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', `${output}/style.css`, '--minify'])
await writeFile(`${output}/index.html`, '<!doctype html><html><head><meta charset="utf-8"><title>Chorono boxed 3D acceptance</title><link rel="stylesheet" href="style.css"></head><body><div id="app"></div><pre id="status"></pre><div id="output"></div><script type="module" src="check.js"></script></body></html>')
console.log(output)
