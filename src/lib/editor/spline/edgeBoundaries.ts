import type { ChronoScene, Layer } from '../../types'
import type { OverrideMap } from '../../evaluator'
import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'
import { createLayerWorldMatrixResolver } from '../../geometry/resolveLayerWorldMatrix'
import { materializeLayerOverrides } from '../../render/materializeOverrides'
import { splineEdgeBoundaries, type SplineEdgeBoundary } from '../../spline/topology/edgeBoundaries'
import { LayerIndex } from '../../scene/LayerIndex'
import { editorSoloScope } from '../../scene/visibility/editorSoloScope'
import { assertLayerAncestors } from '../../scene/hierarchy/assertLayerAncestors'

/** Read current visible spline boundaries in the edited layer's local px.
 * Same-layer source IDs are retained; external curves carry layer-qualified keys
 * and evaluated controls through the complete parent affine matrix. Hidden
 * ancestors and visual Solo are honored. Cutters may be locked/animated because
 * they are read-only. No scene mutation or renderer/browser resource ownership.
 * Basic Shapes/Mesh are not spline boundary targets. Finite 2,048-edge budget. */
export function readSplineEdgeBoundaries(scene: ChronoScene, target: Layer, timeMs = 0, overrides?: OverrideMap): SplineEdgeBoundary[] {
  const boundaries = splineEdgeBoundaries(target.spline!), index = new LayerIndex(scene.layers), scope = editorSoloScope(scene.layers, false, index)
  const frame = overrides ?? evaluateSceneFrame(scene, timeMs).overrides, world = createLayerWorldMatrixResolver(scene, timeMs, frame, index), targetWorld = world(target)
  if (Math.abs(targetWorld.determinant()) < 1e-9) throw new Error('Trim/Extend needs a nonsingular layer transform.')
  const inverse = targetWorld.invert()
  for (const layer of scene.layers) {
    if (layer.id === target.id || layer.type !== 'spline' || !layer.spline || scope && !scope.has(layer.id)) continue
    assertLayerAncestors(scene, layer)
    if (Array.from(index.ancestorIds([layer.id])).some(id => index.get(id)?.hidden)) continue
    const evaluated = materializeLayerOverrides(layer, frame), matrix = inverse.multiply(world(layer))
    for (const boundary of splineEdgeBoundaries(evaluated.spline!)) {
      boundaries.push({ key: `${layer.id}/${boundary.key}`, controls: boundary.controls.map(point => matrix.applyToPoint(point)) })
      if (boundaries.length > 2048) throw new Error('Trim/Extend boundary budget exceeded; hide or isolate unrelated splines.')
    }
  }
  if (boundaries.some(item => item.controls.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y)))) throw new Error('Trim/Extend boundary geometry must have finite coordinates.')
  return boundaries
}
