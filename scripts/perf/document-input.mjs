import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { prepareNativeCheck } from './native-check.mjs'
const output = path.resolve(process.argv[2] ?? 'artifacts/performance/opt27-document-input-20261108/build')
const reference = path.resolve('artifacts/performance/opt27-document-input-20261108/source-before/src/lib/import/handlers/document/SvgDocumentHandler.ts.snapshot')
const plugin = { name: 'immutable-svg-reference', setup(api) {
  api.onResolve({ filter: /^legacy-svg-reference$/ }, () => ({ path: reference }))
  api.onLoad({ filter: /SvgDocumentHandler\.ts\.snapshot$/ }, async () => ({ contents: await readFile(reference, 'utf8'), loader: 'ts', resolveDir: path.resolve('src/lib/import/handlers/document') }))
} }
const metadata = await prepareNativeCheck({ entry: 'src/lib/editor/document/__tests__/browser-document-input.tsx', output,
  format: 'esm', name: 'document-input', title: 'Bounded document native QA', plugins: [plugin],
  metadata: { scope: 'Actual native File/UTF8/DOM SVG/renderer/source ownership, StrictMode open cancellation and real Four Seasons native picker. Private 512 MiB ledger; post-text-decode delivery gates.' } })
await writeFile(path.join(output, 'document-input-sources.json'), JSON.stringify(metadata, null, 2))
console.log(JSON.stringify({ output, sources: metadata.sources.length }))
