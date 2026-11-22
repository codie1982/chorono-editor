import type { ChronoScene } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import { LayerIndex } from '@/lib/scene/LayerIndex'
import { createLayerWorldBoundsResolver } from '@/lib/geometry/resolveLayerWorldBounds'
import { readSceneGuides } from '@/lib/geometry/guides/sceneGuideData'
import { LayerDrawVisibility } from '@/lib/render/visibility/LayerDrawVisibility'
import type { CanvasSnapContext } from './CanvasSnapCollector'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { materializeLayerOverrides } from '@/lib/render/materializeOverrides'
import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
import type { SplineVertexTarget } from './SnapCandidate'

/** Prepare evaluated, composition-space snap bounds once per source/frame or
 * gesture. Moving subtrees and their ancestors cannot snap to themselves.
 * Immediate nonmoving parents are explicit targets; root items use composition
 * edges. Group/rotated geometry uses the existing world-axis bounds contract,
 * frozen for the gesture, rather than pretending to expose exact path edges.
 * Visibility and optional editor isolation scope are shared with display.
 * Optional spline anchors use the same visible scope and exclusion set, with
 * evaluated point and parent coordinates. Hosts request them only for drawing
 * and memoize by source/frame; [] selection includes the active spline itself.
 * No DOM, mutable cache, source change or retained scene handle is created. */
export function prepareSceneSnapContext(scene: ChronoScene, timeMs: number, overrides?: OverrideMap,
  selection: readonly string[] = [], scope?: ReadonlySet<string>, includeSplineVertices = false): CanvasSnapContext {
  const index = new LayerIndex(scene.layers), moving = index.subtreeIds(selection), excluded = new Set(moving)
  const parents = new Set<string>(), bounds = createLayerWorldBoundsResolver(scene, timeMs, overrides)
  let rootParent = selection.length === 0
  for (const id of selection) {
    const direct = index.get(id)?.parentId
    if (!direct) rootParent = true
    else if (!moving.has(direct)) parents.add(direct)
    let parent = direct
    while (parent && !excluded.has(parent)) { excluded.add(parent); parent = index.get(parent)?.parentId }
  }
  const visibility = new LayerDrawVisibility(scene.layers, timeMs)
  const visible = (id: string) => {
    const visited = new Set<string>()
    let layer = index.get(id)
    while (layer && !visited.has(layer.id)) {
      visited.add(layer.id)
      if (!visibility.active(layer) || !layer.parentId && !visibility.root(layer)) return false
      layer = layer.parentId ? index.get(layer.parentId) : undefined
    }
    return true
  }
  const splineVertices: SplineVertexTarget[] = []
  if (includeSplineVertices) {
    const evaluated = overrides ?? evaluateSceneFrame(scene, timeMs).overrides
    for (const layer of scene.layers) {
      if (excluded.has(layer.id) || scope && !scope.has(layer.id) || !visible(layer.id) || layer.type !== 'spline') continue
      const data = materializeLayerOverrides(layer, evaluated).spline
      if (!data) continue
      const matrix = resolveLayerWorldMatrix(layer, scene, timeMs, evaluated)
      if (Math.abs(matrix.determinant()) < 1e-9) continue
      const endpoints = new Set(Object.values(data.contours).filter(contour => !contour.closed).flatMap(contour => [contour.pointIds[0], contour.pointIds.at(-1)]))
      for (const point of Object.values(data.points)) splineVertices.push({ ...matrix.applyToPoint(point), layerId: layer.id, pointId: point.id,
        openEndpoint: endpoints.has(point.id) && !point.locked && !layer.instanceOf && !layer.booleanResultFor })
    }
  }
  return { canvasWidth: scene.composition.width, canvasHeight: scene.composition.height, ...(includeSplineVertices ? { splineVertices } : {}),
    customGuides: readSceneGuides(scene).guides,
    otherLayers: scene.layers.flatMap(layer => {
      if (excluded.has(layer.id) || scope && !scope.has(layer.id) || layer.type === 'audio' || !visible(layer.id)) return []
      const rect = bounds(layer); return rect ? [{ id: layer.id, ...rect }] : []
    }),
    parentBounds: [...(rootParent ? [{ x: 0, y: 0, width: scene.composition.width, height: scene.composition.height }] : []),
      ...Array.from(parents).flatMap(id => { const layer = index.get(id), rect = layer && visible(id) ? bounds(layer) : null; return rect ? [rect] : [] })],
  }
}
