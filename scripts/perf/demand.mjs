import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { prepareNativeCheck } from './native-check.mjs'
const output = path.resolve(process.argv[2] ?? 'artifacts/performance/opt16-viewport-media-20261107/build')
const manifest = await prepareNativeCheck({ entry: 'src/lib/render/media/__tests__/browser-demand.tsx', output,
  name: 'demand-check', title: 'Viewport media demand QA' })
await writeFile(path.join(output, 'demand-inputs.json'), JSON.stringify(manifest, null, 2))
console.log(JSON.stringify({ output, sources: manifest.sources.length }))
