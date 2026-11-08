import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { prepareNativeCheck } from './native-check.mjs'

const output = path.resolve(process.argv[2] ?? 'artifacts/performance/opt15-visual-ownership-20261107/build')
const manifest = await prepareNativeCheck({ entry: 'src/lib/asset/visual/__tests__/browser-visual.tsx', output,
  name: 'visual-check', title: 'Visual media ownership QA' })
await writeFile(path.join(output, 'visual-inputs.json'), JSON.stringify(manifest, null, 2))
console.log(JSON.stringify({ output, sources: manifest.sources.length }))
