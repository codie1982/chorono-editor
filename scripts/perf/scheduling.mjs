import { build } from 'esbuild'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

// Standalone test bundles only; no production test route or browser injection.
const root = process.cwd(), output = path.resolve(process.argv[2] ?? 'artifacts/performance/opt9-runtime-20261107')
const mode = process.argv[3] ?? 'viewport'
if (!['viewport', 'runtime'].includes(mode)) throw new Error(`Unknown scheduling test mode: ${mode}`)
const name = mode === 'viewport' ? 'scheduling' : 'runtime'
await mkdir(output, { recursive: true })
const sourcePairs = mode === 'viewport' ? [
  ['src/components/canvas/hooks/useCanvasRenderer.ts', await readFile(path.join(output, 'canvas-hook-before.ts.txt'), 'utf8')],
  ['src/lib/runtime/lifecycleEmitter.ts', await readFile(path.join(output, 'lifecycle-before.ts.txt'), 'utf8')],
] : [
  ['src/app/hooks/useInteractiveRuntime.ts', await readFile(path.join(output, 'runtime-before.ts.txt'), 'utf8')],
  ['src/app/hooks/useSMRuntime.ts', await readFile(path.join(output, 'sm-before.ts.txt'), 'utf8')],
]
const replacements = new Map(sourcePairs)
if (mode === 'viewport') await copyFile('projects/chorono-four-seasons-48s-v1.chorono.json', path.join(output, 'four-seasons.chorono.json'))
const manifests = {}
for (const variant of ['before', 'after']) {
  const sources = new Map()
  const capture = { name: 'capture-exact-source', setup(api) { api.onLoad({ filter: /\.[tj]sx?$/ }, async args => {
    const relative = path.relative(root, args.path)
    const contents = variant === 'before' && replacements.has(relative) ? replacements.get(relative) : await readFile(args.path, 'utf8')
    sources.set(relative, digest(contents))
    return { contents, loader: path.extname(args.path).slice(1), resolveDir: path.dirname(args.path) }
  }) } }
  const entry = mode === 'viewport' ? 'src/components/canvas/render/__tests__/browser-scheduling.tsx' : 'src/app/hooks/runtime/__tests__/browser-runtime.tsx'
  await build({ entryPoints: [entry], bundle: true, platform: 'browser',
    target: 'es2022', minify: true, jsx: 'automatic', tsconfig: 'tsconfig.json', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [capture], outfile: path.join(output, `${name}-${variant}.js`) })
  await writeFile(path.join(output, `${name}-${variant}.html`), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Chorono ${name} ${variant}</title></head><body><div id="app"></div><script src="${name}-${variant}.js"></script></body></html>`)
  manifests[variant] = { sources: Object.fromEntries(sources), bundleSha256: digest(await readFile(path.join(output, `${name}-${variant}.js`))) }
}
await writeFile(path.join(output, `${name}-sources.json`), JSON.stringify({ preparedAt: new Date().toISOString(),
  fixtureSha256: mode === 'viewport' ? digest(await readFile(path.join(output, 'four-seasons.chorono.json'))) : null, variants: manifests }, null, 2))
console.log(JSON.stringify({ output, variants: Object.keys(manifests) }))
function digest(bytes) { return createHash('sha256').update(bytes).digest('hex') }
