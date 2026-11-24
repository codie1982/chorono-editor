import { flushSync } from 'react-dom'
import { newStructuredGridMesh2DLayer } from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'
import { StructuredGridMesh2DGenerator } from '@/lib/geometry/mesh2d/StructuredGridMesh2DGenerator'
import { MeshComponentSelection } from '@/lib/geometry/mesh2d/selection/MeshComponentSelection'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'
import { makeBakeModifierStackCmd } from '@/lib/editor/modifiers/commands'
import { current, reset, fixture, frames, click, key, canvas, client, pointer, assert, equal, raster } from './splineHarness'

/** Actual panel/viewport/keyboard/transaction acceptance for logical quad faces.
 * Uses a private Mesh, native history and portable loader; never a user scene. */
export async function checkMeshFaceEditing(keepScene = false): Promise<string> {
  await reset()
  const mesh = newStructuredGridMesh2DLayer(); mesh.id = 'face-qa'
  mesh.mesh2d = new StructuredGridMesh2DGenerator().generate({ width: 240, height: 160, columns: 4, rows: 3 })
  mesh.transform = { ...mesh.transform, x: 150, y: 120, rotationDeg: 8, anchorX: 0, anchorY: 0 }
  const texture = document.createElement('canvas')
  texture.width = texture.height = 32
  const paint = texture.getContext('2d')!
  paint.fillStyle = '#39b574'
  paint.fillRect(0, 0, 16, 32)
  paint.fillStyle = '#8b4dad'
  paint.fillRect(16, 0, 16, 32)
  const url = texture.toDataURL()
  mesh.mesh2d = { ...mesh.mesh2d, appearance: { schemaVersion: 1, kind: 'texture', sampling: 'nearest', textureAssetId: 'grid-texture' } }
  const source = { ...fixture(), layers: [mesh], timelines: [], assets: [
    { id: 'grid-texture', type: 'image' as const, name: 'Grid UV check', url, width: 32, height: 32 },
  ] }
  flushSync(() => { current().editor.resetScene(source); current().select(mesh.id); current().setTool('select') }); await frames()
  const layer = () => current().editor.getScene().layers[0]
  const model = () => new MeshComponentSelection(layer().mesh2d!.geometry, resolveLayerWorldMatrix(layer(), current().editor.getScene()))
  assert(document.querySelector('[aria-label="Mesh face mode"]'), 'Face entry is missing outside Edit')
  assert(!current().geometryEdit.active, 'Selecting Mesh automatically entered Edit')
  const before = structuredClone(current().editor.getScene())
  await click('Mesh face mode')
  assert(current().geometryEdit.active && current().geometryEdit.mode === 'face', 'Panel Face did not enter the correct level')
  equal(current().editor.getScene(), before, 'Entering Face changed source')
  assert(model().faces.length === 12 && model().edges.length === 31, '4x3 Grid did not expose 12 quad faces / 31 logical edges')
  assert(document.querySelector('[data-mesh-vertices]')?.getAttribute('d'), 'Vertex markers are missing in Face')
  const first = model().faces[0], selectedIds = new Set(model().vertices('face', [first.id]))
  const center = first.vertices.reduce((p, i) => ({ x: p.x + model().points[i].x / 4, y: p.y + model().points[i].y / 4 }), { x: 0, y: 0 })
  const start = client(center), end = { x: start.x + 2, y: start.y + 1 }
  pointer(canvas(), 'pointerdown', start, { shiftKey: true }); pointer(window, 'pointerup', start, { shiftKey: true }); await frames()
  equal(current().editor.getScene(), before, 'Face pick wrote source/history')
  assert(!current().editor.canUndo, 'Face selection created Undo')
  assert(document.querySelector('[data-mesh-selected-faces]')?.getAttribute('fill') === '#ef4444', 'Selected face lacks red fill')
  assert(document.querySelector('[aria-label="Mesh component summary"]')?.textContent?.includes('Faces selected: 1'), 'Panel selection count did not follow the viewport')
  flushSync(() => canvas().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
    clientX: canvas().getBoundingClientRect().left + 10, clientY: canvas().getBoundingClientRect().top + 10 }))); await frames()
  const menu = document.querySelector('[role="menu"]')?.textContent
  assert(menu?.includes('Edit Mesh Face') && menu.includes('Delete Face') && !menu.includes('Group'), 'Mesh context menu escaped to root layer actions')
  key('Escape'); await frames(); assert(current().geometryEdit.active, 'Closing Mesh menu exited Edit')
  key('2'); await frames()
  const edge = model().edges[0], a = model().points[edge.a], b = model().points[edge.b]
  const edgePoint = client({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  pointer(canvas(), 'pointerdown', edgePoint, { shiftKey: true }); pointer(window, 'pointerup', edgePoint, { shiftKey: true }); await frames()
  assert(document.querySelector('[data-mesh-selected-edges]')?.getAttribute('stroke') === '#ef4444', 'Selected Mesh edge is not red')
  assert(document.querySelector('[data-mesh-vertices]')?.getAttribute('d'), 'Mesh vertices disappeared in Edge mode')
  key('3'); await frames()
  const ghost = document.querySelector('[data-edit-ghost]')?.getAttribute('d')
  pointer(canvas(), 'pointerdown', start); pointer(window, 'pointermove', end); await frames(); pointer(window, 'pointerup', end); await frames()
  const edited = structuredClone(current().editor.getScene()), geometry = layer().mesh2d!.geometry
  geometry.topology.vertexIds.forEach((id, i) => {
    const changed = geometry.positions[i * 2] !== before.layers[0].mesh2d!.geometry.positions[i * 2] || geometry.positions[i * 2 + 1] !== before.layers[0].mesh2d!.geometry.positions[i * 2 + 1]
    assert(changed === selectedIds.has(id), 'Face drag changed the wrong vertices')
  })
  equal(layer().transform, before.layers[0].transform, 'Face movement changed real layer TRS')
  equal(geometry.uvs, before.layers[0].mesh2d!.geometry.uvs, 'Face movement changed UVs')
  assert(layer().modifierStack?.modifiers.filter(r => r.type === 'meshTransform').length === 1, 'Face movement did not use one Edit Mesh')
  await click('Undo'); equal(current().editor.getScene(), before, 'Face movement is not one Undo')
  await click('Redo'); equal(current().editor.getScene(), edited, 'Face Redo differs')
  assert(document.querySelector('[data-edit-ghost]')?.getAttribute('d') === ghost, 'Face edit reset the session ghost')
  const editPixels = await raster()
  key('a', { metaKey: true }); await frames()
  assert(document.querySelector('[aria-label="Mesh component summary"]')?.textContent?.includes('Faces selected: 12'), 'Ctrl/Cmd+A did not select faces')
  assert(current().selected === mesh.id, 'Face Select All escaped to root layers')
  key('Escape'); await frames(); assert(current().geometryEdit.active, 'Escape with selected faces exited Edit instead of clearing')
  key('Escape'); await frames(); assert(!current().geometryEdit.active, 'Second Escape did not leave Mesh Edit')
  const layerPixels = await raster()
  assert(editPixels.every((v, i) => v === layerPixels[i]), 'Mesh Edit overlays leaked into final PNG')
  const loaded = parseSceneJson(JSON.stringify(current().editor.getScene()), true)
  assert(new MeshComponentSelection(loaded.layers[0].mesh2d!.geometry, resolveLayerWorldMatrix(loaded.layers[0], loaded)).faces.length === 12, 'Portable lost quad faces')
  const baked = makeBakeModifierStackCmd(current().editor.getScene(), mesh.id).execute(current().editor.getScene())
  assert(!baked.layers[0].modifierStack && baked.layers[0].mesh2d!.geometry.topology.quadIndices?.length === 48, 'Bake lost logical cells')
  key('3')
  await frames()
  const toggleAt = async (x: number, y: number) => {
    const p = client({ x, y })
    pointer(canvas(), 'pointerdown', p, { shiftKey: true })
    pointer(window, 'pointerup', p, { shiftKey: true })
    await frames()
  }
  const hole = model().faces[5].vertices
  const middle = hole.reduce(
    (sum, id) => ({ x: sum.x + model().points[id].x / 4, y: sum.y + model().points[id].y / 4 }),
    { x: 0, y: 0 },
  )
  await toggleAt(middle.x, middle.y)
  await click('Delete Face')
  assert(model().faces.length === 11, 'Delete Face left the center cell')
  const pixelAt = (pixels: Uint8ClampedArray, x: number, y: number) => {
    const index = (Math.floor(y) * source.composition.width + Math.floor(x)) * 4
    return Array.from(pixels.slice(index, index + 3))
  }
  // Sample inside one triangle, clear of the antialiased render diagonal.
  const interior = hole.slice(0, 3).map((index) => model().points[index])
  const sampleX = interior.reduce((sum, point) => sum + point.x / 3, 0)
  const sampleY = interior.reduce((sum, point) => sum + point.y / 3, 0)
  const texel = pixelAt(layerPixels, sampleX, sampleY)
  assert(
    Math.abs(texel[0] - 57) < 3 && Math.abs(texel[1] - 181) < 3 && Math.abs(texel[2] - 116) < 3,
    'Export did not sample the green half of the grid texture: ' + texel,
  )
  const materialSample = canvas().getContext('2d')!.getImageData(Math.floor(sampleX), Math.floor(sampleY), 1, 1).data
  // This face is deleted in the live viewport, even while the first export
  // still owns the pre-deletion texture sampled above.
  assert(Math.abs(materialSample[1] - texel[1]) > 20, 'Viewport still shows deleted material')
  const holePixels = await raster()
  assert(
    pixelAt(holePixels, sampleX, sampleY).some((v, i) => v !== texel[i]),
    'Deleted face still shows the texture',
  )
  key('2')
  await frames()
  for (let i = 0; i < 4; i++) {
    const a = model().points[hole[i]],
      b = model().points[hole[(i + 1) % 4]]
    await toggleAt((a.x + b.x) / 2, (a.y + b.y) / 2)
  }
  await click('Fill')
  assert(model().faces.filter((f) => f.kind === 'quad').length === 12, 'Fill missed the quad')
  const restoredPixels = await raster()
  const viewportTexel = canvas().getContext('2d')!.getImageData(Math.floor(sampleX), Math.floor(sampleY), 1, 1).data
  assert(texel.every((value, index) => Math.abs(value - viewportTexel[index]) <= 4), 'Viewport Fill lost the decoded texture')
  const width = before.composition.width
  const offset = (Math.floor(middle.y) * width + Math.floor(middle.x)) * 4
  const differences = restoredPixels.reduce((n, v, i) => n + (Math.abs(v - layerPixels[i]) > 4 ? 1 : 0), 0)
  assert(
    differences < restoredPixels.length * 0.001 &&
      restoredPixels.slice(offset, offset + 4).every((v, i) => Math.abs(v - layerPixels[offset + i]) <= 4),
    'Fill changed the rendered grid: ' +
      differences +
      ' differing channels; center ' +
      restoredPixels.slice(offset, offset + 4) +
      ' vs ' +
      layerPixels.slice(offset, offset + 4),
  )
  const edgeToSplit = model().edges.find((e) => e.a === 6 && e.b === 7)!
  const left = model().points[edgeToSplit.a],
    right = model().points[edgeToSplit.b]
  const pos = client({ x: left.x * 0.75 + right.x * 0.25, y: left.y * 0.75 + right.y * 0.25 })
  flushSync(() =>
    canvas().dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: pos.x, clientY: pos.y }),
    ),
  )
  await frames()
  const split = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
    (e) => e.textContent?.trim() === 'Split Edge',
  )
  assert(split, 'Missing context Split Edge')
  flushSync(() => split.click())
  await frames()
  assert(
    model().points.length === 21 && model().faces.length === 14,
    'Split did not create the shared vertex and two local triangles',
  )
  await click('Undo')
  await click('Undo')
  await click('Undo')
  key('Escape')
  await frames()
  if (keepScene) {
    key('3'); await frames()
    pointer(canvas(), 'pointerdown', start, { shiftKey: true }); pointer(window, 'pointerup', start, { shiftKey: true }); await frames()
    const row = document.querySelector<HTMLButtonElement>('[data-modifier-id] button[aria-pressed]')
    if (row) { flushSync(() => row.click()); await frames() }
  } else await reset()
  return 'Delete Face/Fill textured PNG, context Split Edge, Mesh panel/1-2-3, 12 quad faces/31 edges, visible vertices, red face, native face drag with one Edit Mesh/Undo, fixed TRS/UV/ghost, component Select All, portable/Bake'
}
