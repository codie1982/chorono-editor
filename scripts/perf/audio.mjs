import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { prepareNativeCheck } from './native-check.mjs'

// Isolated loopback QA bundle; no production route or browser injection.
const mode = process.argv[3] ?? 'preparation'
if (!['preparation', 'residency'].includes(mode)) throw new Error(`Unknown audio QA mode: ${mode}`)
const output = path.resolve(process.argv[2] ?? `artifacts/performance/${mode === 'preparation' ? 'opt12-audio-preparation' : 'opt13-audio-residency'}-20261107/build`)
const manifest = await prepareNativeCheck({ entry: `src/lib/audio/__tests__/browser-${mode}.tsx`, output,
  name: 'audio-check', title: 'Audio preparation QA', metadata: { mode } })
await writeFile(path.join(output, 'audio-sources.json'), JSON.stringify(manifest, null, 2))
console.log(JSON.stringify({ output, sources: manifest.sources.length }))
