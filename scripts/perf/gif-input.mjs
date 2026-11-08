import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { prepareNativeCheck } from './native-check.mjs'

const output = path.resolve(process.argv[2] ?? 'artifacts/performance/opt25-bounded-gif-20261108/build')
const worker = await prepareNativeCheck({ entry: 'src/lib/import/workers/gifDecode.worker.ts', output, format: 'esm',
  name: 'gif-worker', title: 'Native GIF worker', metadata: { scope: 'Actual production worker and shared sequential composer.' } })
await writeFile(path.join(output, 'gif-worker-sources.json'), JSON.stringify(worker, null, 2))
const metadata = await prepareNativeCheck({ entry: 'src/lib/import/gif/__tests__/browser-gif.tsx', output, format: 'esm',
  name: 'gif-input', title: 'Bounded GIF native preparation', metadata: { scope: 'Actual File/Worker/ImageDecoder/PNG/renderer and cancellation ownership; private 512 MiB ledger.', worker } })
await writeFile(path.join(output, 'gif-input-sources.json'), JSON.stringify(metadata, null, 2))
console.log(JSON.stringify({ output, sourceFiles: metadata.sources.length, workerSourceFiles: worker.sources.length }))
