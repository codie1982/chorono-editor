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

export interface DisplayTransform {
  x: number
  y: number
  rotationDeg: number
  scaleX: number
  scaleY: number
}

/**
 * Resolve the on-screen transform a layer is currently rendered at.
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
): DisplayTransform {
  let x      = getLayerValue(overrides, layer.id, 'transform.x',           layer.transform.x)
  let y      = getLayerValue(overrides, layer.id, 'transform.y',           layer.transform.y)
  let rot    = getLayerValue(overrides, layer.id, 'transform.rotationDeg', layer.transform.rotationDeg)
  const scaleX = getLayerValue(overrides, layer.id, 'transform.scaleX', layer.transform.scaleX)
  const scaleY = getLayerValue(overrides, layer.id, 'transform.scaleY', layer.transform.scaleY)

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
    const pathLayer = scene.layers.find(l => l.id === fp.pathLayerId)
    if (pathLayer?.type === 'path' && pathLayer.path) {
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
          pathLayer.transform.x,
          pathLayer.transform.y,
          {
            orientToPath:        fp.orientToPath,
            rotationOffset:      getLayerValue(overrides, layer.id, 'followPath.rotationOffset', fp.rotationOffset ?? 0),
            perpendicularOffset: getLayerValue(overrides, layer.id, 'followPath.perpendicularOffset', fp.perpendicularOffset ?? 0),
          },
        )
        x = result.x
        y = result.y
        if (fp.orientToPath) rot = result.rotation
      }
    }
  }

  return { x, y, rotationDeg: rot, scaleX, scaleY }
}
