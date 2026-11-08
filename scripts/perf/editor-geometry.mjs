import path from 'node:path'
import { readFile, writeFile, copyFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { prepareNativeCheck } from './native-check.mjs'

const output = path.resolve(process.argv[2] ?? 'artifacts/performance/opt21-editor-geometry-20261108/build')
const snapshot = path.resolve('artifacts/performance/opt21-editor-geometry-20261108/source-before/src/components/SceneCanvas.tsx.snapshot')
const transformProof = {}
/** Trusted source build only: reference component uses the unchanged eager
 * default, while current explicitly opts into lazy bounds. Both share all other
 * production modules. Count actual eager preparation, outside geometry work. */
const plugin = { name: 'editor-geometry-reference', setup(api) {
  api.onResolve({ filter: /^canvas-reference$/ }, () => ({ path: snapshot }))
  api.onLoad({ filter: /\.snapshot$/ }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'tsx', resolveDir: path.resolve('src/components') }))
  api.onLoad({ filter: /[\\/]resolveLayerWorldBounds\.ts$/ }, async args => {
    const source = await readFile(args.path, 'utf8')
    const needle = '  const frame = overrides ?? evaluateTimelines(scene.timelines, timeMs)'
    if (source.split(needle).length !== 2) throw new Error('Unexpected bounds preparation boundary.')
    const contents = "import { recordBoundsPreparation } from '@/components/canvas/render/__tests__/boundsPreparationProbe'\n" + source.replace(needle, '  recordBoundsPreparation()\n' + needle)
    Object.assign(transformProof, { path: path.relative(process.cwd(), args.path),
      originalSha256: digest(source), transformedSha256: digest(contents) })
    return { contents, loader: 'ts', resolveDir: path.dirname(args.path) }
  })
} }
const metadata = await prepareNativeCheck({ entry: 'src/components/canvas/render/__tests__/browser-editor-geometry.tsx', output,
  name: 'editor-geometry', title: 'Editor geometry acceptance', plugins: [plugin], metadata: { transformProof } })
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'src/app/globals.css', '-o', path.join(output, 'editor-base.css'), '--minify'], { stdio: 'pipe' })
const htmlPath = path.join(output, 'editor-geometry.html')
await writeFile(htmlPath, (await readFile(htmlPath, 'utf8')).replace('</head>', '<link rel="stylesheet" href="editor-base.css"></head>'))
const fixture = await readFile('projects/chorono-four-seasons-48s-v1.chorono.json')
await copyFile('projects/chorono-four-seasons-48s-v1.chorono.json', path.join(output, 'four-seasons.chorono.json'))
await writeFile(path.join(output, 'editor-geometry-sources.json'), JSON.stringify({ ...metadata,
  baseCssSha256: digest(await readFile(path.join(output, 'editor-base.css'))), fixtureSha256: digest(fixture) }, null, 2))
console.log(JSON.stringify({ output, sourceFiles: metadata.sources.length, transformProof }))
/** Byte identity for source, trusted transform and tested output. */
function digest(bytes) { return createHash('sha256').update(bytes).digest('hex') }
