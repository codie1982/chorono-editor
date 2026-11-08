import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { prepareNativeCheck } from './native-check.mjs'
const output = path.resolve(process.argv[2] ?? 'artifacts/performance/opt26-import-lifecycle-20261108/build')
const metadata = await prepareNativeCheck({ entry: 'src/lib/import/lifecycle/__tests__/browser-import.tsx', output,
  format: 'esm', name: 'import-lifecycle', title: 'Import document lifetime native QA',
  metadata: { scope: 'Actual StrictMode hooks/PNG handler/source adoption/outer queue and UI cancellation; private 512 MiB ledger. Delivery gates are post-native.' } })
await writeFile(path.join(output, 'import-lifecycle-sources.json'), JSON.stringify(metadata, null, 2))
console.log(JSON.stringify({ output, sources: metadata.sources.length }))
