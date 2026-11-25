import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
const output = process.argv[2] ?? '/private/tmp/chorono-3d-packages-browser'
await mkdir(output,{recursive:true})
await build({entryPoints:['src/lib/model3d/__tests__/browser-packages.tsx'],bundle:true,platform:'browser',format:'esm',target:'es2022',jsx:'automatic',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},outfile:`${output}/check.js`,loader:{'.wasm':'empty'}})
execFileSync('node_modules/.bin/tailwindcss',['-i','src/app/globals.css','-o',`${output}/style.css`,'--minify'])
await writeFile(`${output}/index.html`,'<!doctype html><html><head><meta charset="utf-8"><title>Chorono 3D0–6 acceptance</title><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="check.css"></head><body><div id="app"></div><script type="module" src="check.js"></script></body></html>')
console.log(output)
