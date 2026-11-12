import { build } from 'esbuild'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
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
