import { build } from 'esbuild'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'

/** Shared standalone QA preparation. Inputs/digests are captured once here for
 * audio and source-lifetime checks; this adds no application route/injection.
 * A sourceRoot permits immutable complete-tree comparisons, never a running
 * Next cache. Browser builds have no process shim: explicit public build inputs
 * default to local/no diagnostics and may be overridden by a focused fixture. */
export async function prepareNativeCheck({ entry, output, name, title, metadata = {}, plugins = [], defines = {}, format = 'iife', development = false, sourceRoot = process.cwd() }) {
  await mkdir(output, { recursive: true })
  const result = await build({ absWorkingDir: sourceRoot, entryPoints: [entry], bundle: true, platform: 'browser', target: 'es2022',
    minify: true, jsx: 'automatic', tsconfig: path.join(sourceRoot, 'tsconfig.json'), metafile: true, plugins, format,
    define: { 'process.env.NODE_ENV': JSON.stringify(development ? 'development' : 'production'),
      ...Object.fromEntries(['CHORONO_OFFICIAL_BUILD_ID','CHORONO_OFFICIAL_BUILD_CHANNEL','CHORONO_DIAGNOSTICS_ENDPOINT','CHORONO_DIAGNOSTICS_OPERATOR'].map(key=>['process.env.NEXT_PUBLIC_'+key,'undefined'])),
      ...defines }, outfile: path.join(output, `${name}.js`) })
  const digest = bytes => createHash('sha256').update(bytes).digest('hex'), sources = []
  for (const file of Object.keys(result.metafile.inputs).sort()) sources.push({ path: file, sha256: digest(await readFile(path.resolve(sourceRoot, file))) })
  const css = await readFile(path.join(output, `${name}.css`)).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  await writeFile(path.join(output, `${name}.html`), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>${css ? `<link rel="stylesheet" href="${name}.css">` : ''}</head><body><div id="app"></div><script${format === 'esm' ? ' type="module"' : ''} src="${name}.js"></script></body></html>`)
  return { preparedAt: new Date().toISOString(), ...metadata, reactMode: development ? 'development' : 'production', sources,
    bundleSha256: digest(await readFile(path.join(output, `${name}.js`))), cssSha256: css ? digest(css) : null }
}

/** Actual EditorPage QA needs the local welcome font and editor Tailwind rules.
 * Share this preparation across responsive and selection acceptance. Only QA
 * artifacts are written; caller must stop Next before compiling the fixture. */
export async function prepareFullEditorCheck({ entry, output, name, title }) {
  // Next resolves new URL(worker.ts, import.meta.url) itself. A standalone
  // esbuild fixture needs the same production worker at a flat static URL.
  // Only its packaging URL changes; source/worker logic and digests are retained.
  const worker = await prepareNativeCheck({ entry: 'src/lib/geometry/boolean/boolean.worker.ts', output, name: 'boolean-worker', title: 'Boolean worker', format: 'esm' })
  const bandWorker = await prepareNativeCheck({ entry: 'src/lib/spline/band/band.worker.ts', output, name: 'band-worker', title: 'Band worker', format: 'esm' })
  const outlineWorker = await prepareNativeCheck({ entry: 'src/lib/spline/outline/outline.worker.ts', output, name: 'outline-worker', title: 'Outline worker', format: 'esm' })
  const chamferWorker = await prepareNativeCheck({ entry: 'src/lib/spline/chamfer/chamfer.worker.ts', output, name: 'chamfer-worker', title: 'Chamfer worker', format: 'esm' })
  const filletWorker = await prepareNativeCheck({ entry: 'src/lib/spline/fillet/fillet.worker.ts', output, name: 'fillet-worker', title: 'Fillet worker', format: 'esm' })
  const metadata = await prepareNativeCheck({ entry, output, name, title, format: 'esm', metadata: { worker, bandWorker, outlineWorker, chamferWorker, filletWorker },
    plugins: [{ name: 'local-welcome-font', setup(api) {
      api.onResolve({ filter: /^\/fonts\/GeistVF\.woff$/ }, () => ({ path: './GeistVF.woff', external: true }))
    } }, { name: 'boolean-worker-fixture-url', setup(api) {
      api.onLoad({ filter: /(SplineBandWorkerClient|BooleanWorkerClient|OutlineWorkerClient|ChamferWorkerClient|FilletWorkerClient)\.ts$/ }, async args => ({ loader: 'ts',
        contents: (await readFile(args.path, 'utf8')).replace("new URL('./boolean.worker.ts', import.meta.url)", "new URL('./boolean-worker.js', import.meta.url)")
          .replace("new URL('./band.worker.ts', import.meta.url)", "new URL('./band-worker.js', import.meta.url)")
          .replace("new URL('./outline.worker.ts', import.meta.url)", "new URL('./outline-worker.js', import.meta.url)")
          .replace("new URL('./chamfer.worker.ts', import.meta.url)", "new URL('./chamfer-worker.js', import.meta.url)")
          .replace("new URL('./fillet.worker.ts', import.meta.url)", "new URL('./fillet-worker.js', import.meta.url)") }))
    } }] })
  await copyFile('public/fonts/GeistVF.woff', path.join(output, 'GeistVF.woff'))
  execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', path.join(output, 'editor-base.css'), '--minify'], { stdio: 'pipe' })
  const html = path.join(output, `${name}.html`)
  await writeFile(html, (await readFile(html, 'utf8')).replace('</head>', '<link rel="stylesheet" href="editor-base.css"></head>'))
  await writeFile(path.join(output, `${name}-sources.json`), JSON.stringify(metadata, null, 2))
  return { output, html, sources: metadata.sources.length }
}
