import { flushSync } from 'react-dom'
import { newSplineLayerFromData } from '@/lib/defaults'
import { prepareConvertModifierStack } from '@/lib/editor/modifiers/commands'
import { MeshComponentSelection } from '@/lib/geometry/mesh2d/selection/MeshComponentSelection'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { Mesh2DBoundaryRingExtractor } from '@/lib/geometry/mesh2d/Mesh2DBoundaryRingExtractor'
import { current, fixture, frames, click, key, choose, pointer, client, canvas, assert } from './splineHarness'

/** Exercise authored controls through the real edit dock and pointer surface,
 * then feed the resulting closed geometry to the same conversion as the menu. */
export async function checkSplineDrawingMesh() {
  const layer = newSplineLayerFromData(
    { points: {}, handles: {}, segments: {}, contours: {}, subShapes: {}, fillRule: 'nonzero' },
    { x: 0, y: 0 },
  )
  const scene = { ...fixture(), timelines: [], layers: [layer] }
  flushSync(() => {
    current().editor.resetScene(scene)
    current().select(layer.id)
    current().setTool('select')
  })
  await frames()
  key('3')
  await frames()
  const data = () => current().editor.getScene().layers[0].spline!
  const pen = async (points: number[][]) => {
    await choose('Add spline object', 'custom')
    for (const [x, y, dx = 0, dy = 0] of points) {
      const p = client({ x, y }),
        end = client({ x: x + dx, y: y + dy })
      pointer(canvas(), 'pointerdown', p)
      if (dx || dy) pointer(window, 'pointermove', end)
      pointer(window, 'pointerup', end)
      await frames()
    }
  }
  await pen([
    [100, 80],
    [320, 80],
    [340, 160, 0, 15],
    [320, 250],
    [100, 250],
    [100, 80],
  ])
  assert(
    Object.values(data().contours)[0]?.closed && Object.keys(data().handles).length >= 2,
    'Pen did not commit a closed cubic contour',
  )
  await pen([
    [150, 110],
    [150, 190],
    [220, 190],
    [220, 110],
    [150, 110],
  ])
  assert(Object.keys(data().contours).length === 2, 'Pen hole was not appended')
  await click('Undo')
  assert(Object.keys(data().contours).length === 1, 'One Pen gesture did not undo')
  await click('Redo')
  const before = current().editor.getScene(),
    convert = prepareConvertModifierStack(before, layer.id, 'mesh2d')
  flushSync(() => current().editor.dispatchCommand(convert.command))
  await frames()
  const geometry = current().editor.getScene().layers[0].mesh2d!.geometry
  assert(
    new Mesh2DBoundaryRingExtractor().extract(geometry).some((r) => r.role === 'hole'),
    'Pen hole lost on conversion',
  )
  const meshLayer = () => current().editor.getScene().layers[0]
  const components = () =>
    new MeshComponentSelection(
      meshLayer().mesh2d!.geometry,
      resolveLayerWorldMatrix(meshLayer(), current().editor.getScene()),
    )
  key('2')
  await frames()
  const boundary = new Mesh2DBoundaryRingExtractor().extract(geometry).find((ring) => ring.role === 'hole')!
  const [a, b] = boundary.vertexIndices
  const beforeSplit = components()
  const midpoint = client({
    x: (beforeSplit.points[a].x + beforeSplit.points[b].x) / 2,
    y: (beforeSplit.points[a].y + beforeSplit.points[b].y) / 2,
  })
  pointer(canvas(), 'pointerdown', midpoint, { shiftKey: true })
  pointer(window, 'pointerup', midpoint, { shiftKey: true })
  await frames()
  await click('Split Edge')
  const splitGeometry = meshLayer().mesh2d!.geometry
  const added = components().points.find((point) => !geometry.topology.vertexIds.includes(point.id))
  assert(
    added && splitGeometry.topology.vertexIds.length === geometry.topology.vertexIds.length + 1,
    'Split did not insert one editable vertex on the drawn hole',
  )
  key('1')
  await frames()
  const from = client(added),
    to = client({ x: added.x + 2, y: added.y + 1 })
  pointer(canvas(), 'pointerdown', from)
  pointer(window, 'pointermove', to)
  await frames()
  pointer(window, 'pointerup', to)
  await frames()
  const moved = components().points.find((point) => point.id === added.id)!
  assert(Math.hypot(moved.x - added.x, moved.y - added.y) > 0.1, 'New hole vertex did not move')
  assert(
    new Mesh2DBoundaryRingExtractor().extract(meshLayer().mesh2d!.geometry).some((ring) => ring.role === 'hole'),
    'Moving the split vertex closed the hole',
  )
  await click('Undo')
  assert(
    JSON.stringify(meshLayer().mesh2d!.geometry) === JSON.stringify(splitGeometry),
    'Vertex Undo changed the split',
  )
  await click('Undo')
  assert(JSON.stringify(meshLayer().mesh2d!.geometry) === JSON.stringify(geometry), 'Split Undo changed the conversion')
  await click('Undo')
  key('3')
  await frames()
  await choose('Add spline object', 'freehand')
  pointer(canvas(), 'pointerdown', client({ x: 30, y: 30 }))
  for (const [x, y] of [
    [48, 32],
    [60, 44],
    [72, 42],
  ])
    pointer(window, 'pointermove', client({ x, y }))
  pointer(window, 'pointerup', client({ x: 87, y: 46 }))
  await frames()
  assert(
    Object.values(data().subShapes).some((o) => o.kind === 'freehand'),
    'Freehand gesture missed',
  )
  await click('Undo')
  await choose('Add spline object', 'spiral')
  pointer(canvas(), 'pointerdown', client({ x: 30, y: 30 }))
  pointer(window, 'pointerup', client({ x: 85, y: 85 }))
  await frames()
  assert(
    Object.values(data().subShapes).some((o) => o.kind === 'spiral'),
    'Spiral gesture missed',
  )
}
