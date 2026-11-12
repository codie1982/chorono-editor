import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

// Standalone test bundle: real components, independent React/history, no Next
// server or MCP. Output remains outside the application's source/build tree.
const output = path.resolve(process.argv[2] ?? '/private/tmp/chorono-doc-panels')
await mkdir(output, { recursive: true })
await build({ entryPoints: ['src/components/documentation-tests/browser.tsx'], bundle: true,
  platform: 'browser', format: 'esm', target: 'es2022', jsx: 'automatic', tsconfig: 'tsconfig.json',
  plugins: [{ name: 'standalone-gif-worker', setup(builder) {
    // Next resolves this URL in production; this host emits the same worker separately.
    builder.onLoad({ filter: /GifDecodeWorkerClient\.ts$/ }, async ({ path: source }) => ({
      contents: (await readFile(source, 'utf8')).replace("'./gifDecode.worker.ts'", "'./gifDecode.worker.js'"), loader: 'ts',
    }))
  } }],
  define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' }, outfile: path.join(output, 'check.js'), loader: { '.wasm': 'empty' } })
await build({ entryPoints: ['src/lib/import/workers/gifDecode.worker.ts'], bundle: true,
  platform: 'browser', target: 'es2022', outfile: path.join(output, 'gifDecode.worker.js') })
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', path.join(output, 'base.css'), '--minify'], { stdio: 'pipe' })
await writeFile(path.join(output, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Chorono isolated documentation panels</title><link rel="stylesheet" href="base.css"><link rel="stylesheet" href="check.css"></head><body><div id="app"></div><script type="module" src="check.js"></script></body></html>')
console.log(JSON.stringify({ output, serve: `node scripts/perf/serve.mjs ${output} 4322` }))
