import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { prepareNativeCheck } from './native-check.mjs'

const output = path.resolve(process.argv[2] ?? 'artifacts/performance/opt24-bounded-zip-20261108/build')
const metadata = await prepareNativeCheck({ entry: 'src/lib/import/zip/__tests__/browser-zip.tsx', output,
  name: 'zip-input', title: 'Bounded ZIP native input', metadata: { scope: 'Native File/raw-DEFLATE, PNG pixels, Lottie metadata/command/source and cancellation scopes; private 512 MiB ledger.' } })
await writeFile(path.join(output, 'zip-input-sources.json'), JSON.stringify(metadata, null, 2))
console.log(JSON.stringify({ output, sourceFiles: metadata.sources.length }))
