import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { compareRgbaPngs } from './png-rgba.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const mode = process.argv[2] ?? 'setup'
const sourceProjectName = 'image-fracture-uv-source-acceptance-2026-11-21'
const acceptedProjectName = 'image-fracture-uv-acceptance-2026-11-21'
const outputDir = path.join(root, '.chorono/acceptance/image-fracture-uv-2026-11-21')
const editorUrl = process.env.CHORONO_EDITOR_URL ?? 'http://127.0.0.1:2010'

if (!['setup', 'inspect'].includes(mode)) throw new Error('Use setup or inspect.')
if (!/^http:\/\/(127\.0\.0\.1|localhost):2010\/?$/.test(editorUrl)) {
  throw new Error('This acceptance harness is intentionally pinned to the isolated editor on port 2010.')
}

await mkdir(outputDir, { recursive: true })
const client = new Client({ name: 'image-fracture-uv-live-acceptance', version: '1.0.0' })
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'dist/mcp/server.cjs')],
  cwd: root,
  env: { ...process.env, CHORONO_PROJECT_ROOT: root, CHORONO_EDITOR_URL: editorUrl },
})
await client.connect(transport)

/** Parse one ordinary text tool result and preserve image content for previews. */
async function rawCall(name, arguments_ = {}) {
  const result = await client.callTool({ name, arguments: arguments_ }, undefined, { timeout: 130_000 })
  if (result.isError) throw new Error(`${name}: ${result.content[0]?.text ?? 'unknown failure'}`)
  if (name === 'render_preview') return result
  return JSON.parse(result.content[0]?.text ?? '{}')
}

const sourceGuardCache = new Map()

/** Discover whether a tool mutates source instead of guessing its guard contract. */
async function requiresReadToken(name) {
  if (!sourceGuardCache.has(name)) {
    const capability = await rawCall('get_capabilities', { toolName: name })
    sourceGuardCache.set(name, capability.tool.inputSchema.required?.includes('readToken') === true)
  }
  return sourceGuardCache.get(name)
}

let sessionId

/** Invoke one tool against the explicit editor and acquire a fresh write token when required. */
async function call(name, arguments_ = {}) {
  const scoped = ['list_sessions', 'get_capabilities'].includes(name)
    ? { ...arguments_ }
    : { sessionId, ...arguments_ }
  if (await requiresReadToken(name) && scoped.readToken === undefined) {
    const read = await rawCall('get_scene', { sessionId })
    scoped.expectedRevision = read.revision
    scoped.readToken = read.readToken
  }
  return rawCall(name, scoped)
}

/** Persist a real renderer PNG and return the preview metadata emitted by MCP. */
async function writePreview(fileName, options) {
  const preview = await call('render_preview', options)
  const image = preview.content.find(item => item.type === 'image')
  const metadata = preview.content.find(item => item.type === 'text')
  assert(image?.data && image.mimeType === 'image/png', 'render_preview did not return a PNG')
  await writeFile(path.join(outputDir, fileName), Buffer.from(image.data, 'base64'))
  return metadata?.text ? JSON.parse(metadata.text) : {}
}

/** Assert the fragment keeps source-local positions and full-source normalized UVs. */
function assertFragmentMesh(layer, width, height) {
  const mesh = layer.mesh2d
  assert.equal(mesh?.source?.kind, 'fractureFragment')
  assert.equal(mesh.appearance?.kind, 'texture')
  assert.equal(mesh.appearance.textureAssetId, 'asset_image_fracture_uv_test')
  assert.equal(mesh.appearance.textureTransform?.fit, 'cover')
  assert.deepEqual(mesh.geometry.textureReferenceBounds, { x: 0, y: 0, width, height })
  assert.equal(mesh.geometry.positions.length, mesh.geometry.uvs.length)
  assert.equal(mesh.geometry.positions.length / 2, mesh.geometry.topology.vertexIds.length)
  for (let index = 0; index < mesh.geometry.positions.length; index += 2) {
    assert(Math.abs(mesh.geometry.uvs[index] - mesh.geometry.positions[index] / width) < 1e-9)
    assert(Math.abs(mesh.geometry.uvs[index + 1] - mesh.geometry.positions[index + 1] / height) < 1e-9)
  }
}

/** Read one exact numeric event key; the fixture deliberately pins this time. */
function exactTrackValue(scene, target, timeMs) {
  const tracks = scene.timelines.flatMap(timeline => timeline.tracks)
  const track = tracks.find(candidate => candidate.target === target)
  const key = track?.keyframes.find(candidate => Math.abs(candidate.timeMs - timeMs) < 1e-9)
  assert.equal(typeof key?.value, 'number', `Missing exact numeric key for ${target} at ${timeMs} ms.`)
  return key.value
}

try {
  const summary = await rawCall('get_capabilities', { summary: true })
  const fractureCapability = await rawCall('get_capabilities', { toolName: 'prepare_voronoi_fracture_bake' })
  const resource = await client.readResource({ uri: 'chorono://scripting' })
  assert(/mesh2d/i.test(JSON.stringify(summary)))
  assert.match(JSON.stringify(fractureCapability), /image rectangle/i)
  assert.match(JSON.stringify(fractureCapability), /Mesh2D/i)
  assert(resource.contents.some(item => item.text?.includes('SceneAPI')))

  const sessions = (await rawCall('list_sessions')).sessions
  assert.equal(sessions.length, 1, 'Connect exactly one editor on port 2010.')
  sessionId = sessions[0].id

  if (mode === 'setup') {
    await call('load_project', { name: sourceProjectName })
    const current = await call('get_scene')
    assert.equal(current.scene.layers.length, 2)
    assert.equal(current.scene.layers.find(layer => layer.id === 'image_fracture_source')?.type, 'image')
    assert.equal(current.scene.assets.find(asset => asset.id === 'asset_image_fracture_uv_test')?.width, 64)
    // The browser owns image decode; give the portable data URL one bounded turn
    // before capturing the first renderer frame after a project replacement.
    await new Promise(resolve => setTimeout(resolve, 750))
    await call('control_playback', {
      action: 'pause',
      timeMs: 0,
      timelineId: 'image_fracture_uv_timeline',
      timelineIds: ['image_fracture_uv_timeline'],
    })
    const preview = await writePreview('source-0ms.png', {
      timeMs: 0,
      timelineIds: ['image_fracture_uv_timeline'],
      width: 800,
    })
    const validation = await call('validate_scene')
    assert.equal(validation.valid, true)
    console.log(JSON.stringify({
      mode,
      sessionId,
      revision: current.revision,
      layers: current.scene.layers.length,
      assets: current.scene.assets.length,
      timelineId: 'image_fracture_uv_timeline',
      preview,
      validation,
    }, null, 2))
  } else {
    const current = await call('get_scene')
    const source = current.scene.layers.find(layer => layer.id === 'image_fracture_source')
    assert(source?.size, 'Image fracture source is missing.')
    const fragments = current.scene.layers.filter(layer =>
      layer.type === 'mesh2d' && layer.mesh2d?.source?.kind === 'fractureFragment')
    assert.equal(fragments.length, 16)
    fragments.forEach(layer => assertFragmentMesh(layer, source.size.width, source.size.height))

    const bake = current.scene.physics?.rigidBakes?.find(record =>
      record.recipe?.fractureAppearance?.sourceLayerId === source.id)
    assert(bake, 'Image fracture bake provenance is missing.')
    assert.deepEqual({
      kind: bake.recipe.fractureAppearance.kind,
      assetId: bake.recipe.fractureAppearance.assetId,
      assetWidth: bake.recipe.fractureAppearance.assetWidth,
      assetHeight: bake.recipe.fractureAppearance.assetHeight,
      objectFit: bake.recipe.fractureAppearance.objectFit,
    }, {
      kind: 'image',
      assetId: 'asset_image_fracture_uv_test',
      assetWidth: 64,
      assetHeight: 40,
      objectFit: 'cover',
    })
    assert.match(bake.recipe.fractureAppearance.contentHash, /^[a-f0-9]{16}$/)

    const previewTimes = [0, 799, 799.999, 800, 1200]
    const previews = []
    for (const timeMs of previewTimes) {
      previews.push(await writePreview(`render-${timeMs}ms.png`, {
        timeMs,
        timelineIds: ['image_fracture_uv_timeline'],
        width: 800,
      }))
    }
    const rasterTransitionDiff = compareRgbaPngs(
      await readFile(path.join(outputDir, 'render-799.999ms.png')),
      await readFile(path.join(outputDir, 'render-800ms.png')),
    )
    const eventBounds = {
      x: Math.round(exactTrackValue(current.scene, `layers.${source.id}.transform.x`, 800)),
      y: Math.round(exactTrackValue(current.scene, `layers.${source.id}.transform.y`, 800)),
      width: source.size.width,
      height: source.size.height,
    }
    const rasterInteriorSeamDiff = compareRgbaPngs(
      await readFile(path.join(outputDir, 'render-799.999ms.png')),
      await readFile(path.join(outputDir, 'render-800ms.png')),
      { region: { x: eventBounds.x + 1, y: eventBounds.y + 1, width: eventBounds.width - 2, height: eventBounds.height - 2 } },
    )
    assert.equal(rasterInteriorSeamDiff.changedPixelCount, 0, 'Image fracture introduced an internal raster seam at the topology event.')
    const validation = await call('validate_scene')
    assert.equal(validation.valid, true)
    assert.deepEqual(validation.errors ?? [], [])
    const saved = await call('save_project', { name: acceptedProjectName, overwrite: true })
    const bytes = await readFile(saved.path)
    const portable = JSON.parse(bytes.toString('utf8'))
    const portableFragments = portable.layers.filter(layer =>
      layer.type === 'mesh2d' && layer.mesh2d?.source?.kind === 'fractureFragment')
    assert.equal(portableFragments.length, 16)
    assert(portable.assets.every(asset => !asset.url?.startsWith('blob:')))
    const report = {
      mode,
      sessionId,
      revision: current.revision,
      fragmentCount: fragments.length,
      topologyTriangleCount: fragments.reduce((sum, layer) =>
        sum + layer.mesh2d.geometry.topology.triangleIndices.length / 3, 0),
      bakeId: bake.id,
      generationId: bake.fractureGeneration?.generationId,
      appearance: bake.recipe.fractureAppearance,
      previewTimes,
      previews,
      rasterTransitionDiff,
      rasterInteriorSeamDiff,
      validation,
      savedPath: saved.path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }
    await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    console.log(JSON.stringify(report, null, 2))
  }
} finally {
  await client.close()
}
