import path from 'node:path'
import { readFile, writeFile, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { prepareNativeCheck } from './native-check.mjs'

const output = path.resolve(process.argv[2] ?? 'artifacts/performance/opt22-shared-preparation-20261108/build')
const metadata = await prepareNativeCheck({ entry: 'src/lib/resources/jobs/__tests__/browser-media-preparation.tsx', output,
  name: 'media-preparation', title: 'Shared native preparation', metadata: { scope: 'Actual domain services, native decoders and resource panel; private executor and ledger.' } })
await copyFile('src/app/fonts/GeistVF.woff', path.join(output, 'native-font.woff'))
await writeFile(path.join(output, 'media-preparation-sources.json'), JSON.stringify({ ...metadata,
  fontSha256: createHash('sha256').update(await readFile(path.join(output, 'native-font.woff'))).digest('hex') }, null, 2))
console.log(JSON.stringify({ output, sourceFiles: metadata.sources.length }))
