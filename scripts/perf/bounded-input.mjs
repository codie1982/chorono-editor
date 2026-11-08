import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { prepareNativeCheck } from './native-check.mjs'

const output = path.resolve(process.argv[2] ?? 'artifacts/performance/opt23-bounded-input-20261108/build')
const metadata = await prepareNativeCheck({ entry: 'src/lib/resources/io/__tests__/browser-bounded-input.tsx', output,
  name: 'bounded-input', title: 'Bounded native input', metadata: { scope: 'Native response bodies, audio settlement and real PNG handler/transaction; private 512 MiB ledger.' } })
await writeFile(path.join(output, 'bounded-input-sources.json'), JSON.stringify(metadata, null, 2))
console.log(JSON.stringify({ output, sourceFiles: metadata.sources.length }))
