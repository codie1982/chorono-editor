// ── resolveDisplayTransform ──────────────────────────────────────────────────
//
// Pure helper that computes a layer's RENDERED position/rotation, taking
// keyframe overrides + motionPath + followPath into account. Used by both
// CanvasRenderer (drawing) and SceneCanvas (selection frame / gizmo
// placement) so the editor UI and the canvas stay in sync.
//
// Kept dependency-free: no canvas state, no React, no DOM. Inputs are all
// data — outputs are scalar numbers.

import type { ChronoScene, Layer } from '@/lib/types'
import { getLayerValue, type OverrideMap } from '@/lib/evaluator'
import { evaluateMotionPath } from '@/lib/motionPath'
import { layerRegistry } from '@/lib/registry'
import { defaultPathMotionResolver } from '@/lib/path/PathMotionResolver'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { materializeLayerOverrides } from './materializeOverrides'
import { resolveInstanceLayer } from '@/lib/clone/InstanceResolver'
import type { LayerLookup } from '@/lib/scene/LayerIndex'

export interface DisplayTransform {
  x: number
  y: number
  rotationDeg: number
  scaleX: number
  scaleY: number
}

/**
 * Resolve the on-screen transform a layer is currently rendered at.
 * Optional lookup must match scene.layers for this evaluated frame. The
 * recursion's visiting set remains shared, preserving parent/follow cycle
 * behavior. Legacy callers without a lookup retain linear source searches.
 *
 * Override order (last wins):
 *   1. Static layer.transform.*
 *   2. Animated tracks (overrides map)
 *   3. layer.motionPath (SVG-string)
 *   4. layer.followPath (binds to another path layer; progress comes from the
 *      `followPath.progress` keyframe track — seeded 0 → 1 by
 *      `assignMotionPathToLayer` on assign, fully editable on the timeline)
 */
export function resolveDisplayTransform(
  layer:    Layer,
  scene:    ChronoScene,
  timeMs:   number,
  overrides: OverrideMap,
  visiting = new Set<string>(),
  lookup?: LayerLookup,
): DisplayTransform {
  let x      = getLayerValue(overrides, layer.id, 'transform.x',           layer.transform.x)
  let y      = getLayerValue(overrides, layer.id, 'transform.y',           layer.transform.y)
  let rot    = getLayerValue(overrides, layer.id, 'transform.rotationDeg', layer.transform.rotationDeg)
  const scaleX = getLayerValue(overrides, layer.id, 'transform.scaleX', layer.transform.scaleX)
  const scaleY = getLayerValue(overrides, layer.id, 'transform.scaleY', layer.transform.scaleY)
  // Follow-path references can form cycles in old/imported data. Keep their
  // base transforms usable instead of recursing through their parent chains.
  if (visiting.has(layer.id)) return { x, y, rotationDeg: rot, scaleX, scaleY }
  visiting.add(layer.id)

  // Motion path override (SVG-string-based)
  if (layer.motionPath?.pathData) {
    const off = getLayerValue(overrides, layer.id, 'motionPath.offset', 0)
    const mp  = evaluateMotionPath(layer.motionPath.pathData, off)
    if (mp) {
      x = mp.x; y = mp.y
      if (layer.motionPath.autoRotate) rot = mp.rotationDeg
    }
  }

  // Follow Path override (binds to another path layer's geometry)
  if (layer.followPath) {
    const fp = layer.followPath
    const source = lookup ? lookup.get(fp.pathLayerId) : scene.layers.find(l => l.id === fp.pathLayerId)
    const resolved = source && resolveInstanceLayer(source, scene.layers, 0, lookup)
    const pathLayer = resolved && materializeLayerOverrides(resolved, overrides)
    if (pathLayer && (pathLayer.type === 'path' || pathLayer.type === 'spline')) {
      const def = layerRegistry.findForLayer(pathLayer)
      const pathDef = def?.toPath?.(pathLayer)
      if (pathDef && pathDef.commands.length > 0) {
        // Progress comes from the timeline track `followPath.progress` (the
        // overrides map). `assignMotionPathToLayer` seeds 0 → 1 keyframes on
        // assign, so the animation is visible AND editable on the timeline.
        // Static fallback applies when no track exists yet.
        const progress = getLayerValue(overrides, layer.id, 'followPath.progress', fp.progress ?? 0)

        const result = defaultPathMotionResolver.resolve(
          pathDef,
          progress,
          0,
          0,
          {
            orientToPath: true,
          },
        )
        const parent = layer.parentId ? (lookup ? lookup.get(layer.parentId) : scene.layers.find(item => item.id === layer.parentId)) : undefined
        const parentMatrix = parent ? pathWorldMatrix(parent, scene, timeMs, overrides, visiting, lookup) : Matrix2D.identity()
        if (Math.abs(parentMatrix.determinant()) >= 1e-9) {
          const matrix = parentMatrix.invert().multiply(pathWorldMatrix(pathLayer, scene, timeMs, overrides, visiting, lookup))
          const position = matrix.applyToPoint(result)
          const radians = result.rotation * Math.PI / 180
          const tangent = matrix.applyToVector({ x: Math.cos(radians), y: Math.sin(radians) })
          const length = Math.hypot(tangent.x, tangent.y)
          const perpendicular = getLayerValue(overrides, layer.id, 'followPath.perpendicularOffset', fp.perpendicularOffset ?? 0)
          x = position.x + (length > 0 ? tangent.y / length * perpendicular : 0)
          y = position.y - (length > 0 ? tangent.x / length * perpendicular : 0)
          if (fp.orientToPath && length > 0) rot = Math.atan2(tangent.y, tangent.x) * 180 / Math.PI
            + getLayerValue(overrides, layer.id, 'followPath.rotationOffset', fp.rotationOffset ?? 0)
        }
      }
    }
  }

  visiting.delete(layer.id)
  return { x, y, rotationDeg: rot, scaleX, scaleY }
}

/** Local → composition matrix without importing resolveLayerWorldMatrix (it
 * calls this resolver). Sharing the visiting set bounds follow/parent cycles. */
function pathWorldMatrix(layer: Layer, scene: ChronoScene, timeMs: number, overrides: OverrideMap,
  visiting: Set<string>, lookup?: LayerLookup): Matrix2D {
  const chain: Layer[] = [], parents = new Set<string>()
  let item: Layer | undefined = layer
  while (item && !parents.has(item.id)) {
    parents.add(item.id)
    chain.unshift(item)
    const parentId: string | undefined = item.parentId
    item = parentId ? (lookup ? lookup.get(parentId) : scene.layers.find(candidate => candidate.id === parentId)) : undefined
  }
  let matrix = Matrix2D.identity()
  for (const item of chain) {
    const display = resolveDisplayTransform(item, scene, timeMs, overrides, visiting, lookup)
    const anchorX = getLayerValue(overrides, item.id, 'transform.anchorX', item.transform.anchorX)
    const anchorY = getLayerValue(overrides, item.id, 'transform.anchorY', item.transform.anchorY)
    matrix = matrix.translate(display.x + anchorX, display.y + anchorY).rotate(display.rotationDeg)
      .scale(display.scaleX, display.scaleY).translate(-anchorX, -anchorY)
  }
  return matrix
}
