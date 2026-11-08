import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { prepareNativeCheck } from './native-check.mjs'

const output = path.resolve(process.argv[2] ?? 'artifacts/performance/opt14-source-lifetime-20261107/build')
const manifest = await prepareNativeCheck({ entry: 'src/lib/asset/sources/__tests__/browser-sources.tsx', output,
  name: 'source-check', title: 'Original source ownership QA' })
await writeFile(path.join(output, 'source-inputs.json'), JSON.stringify(manifest, null, 2))
console.log(JSON.stringify({ output, sources: manifest.sources.length }))
