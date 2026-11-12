import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { prepareNativeCheck } from './native-check.mjs'

// Production browser ownership/UI, explicit loopback destination and isolated
// QA origin. No first-run decision or failure signal is generated automatically.
const output = path.resolve(process.argv[2] ?? 'artifacts/validation/diagnostics-d1-20261110/browser')
const metadata = await prepareNativeCheck({ entry: 'src/components/resources/diagnostics/__tests__/browser-diagnostic-sharing.tsx',
  output, name: 'diagnostic-sharing', title: 'Chorono diagnostic consent acceptance', defines: {
    'process.env.NEXT_PUBLIC_CHORONO_OFFICIAL_BUILD_ID': 'undefined',
    'process.env.NEXT_PUBLIC_CHORONO_OFFICIAL_BUILD_CHANNEL': 'undefined',
    'process.env.NEXT_PUBLIC_CHORONO_DIAGNOSTICS_ENDPOINT': 'undefined',
    'process.env.NEXT_PUBLIC_CHORONO_DIAGNOSTICS_OPERATOR': 'undefined',
  } })
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', path.join(output, 'editor-base.css'), '--minify'], { stdio: 'pipe' })
const html = path.join(output, 'diagnostic-sharing.html')
await writeFile(html, (await readFile(html, 'utf8')).replace('</head>', '<link rel="stylesheet" href="editor-base.css"></head>'))
const baseCssSha256 = createHash('sha256').update(await readFile(path.join(output, 'editor-base.css'))).digest('hex')
await writeFile(path.join(output, 'diagnostic-sharing-sources.json'), JSON.stringify({ ...metadata, baseCssSha256,
  fixtureSource: 'Actual consent UI, localStorage ownership, Web Locks, production outbox/fetch and version reader. Explicit QA clock button preserves a testable 5-minute interval.' }, null, 2))
console.log(JSON.stringify({ output, sourceFiles: metadata.sources.length, html }))
