import type { ChronoScene, Layer } from '@/lib/types'
import { evaluateTimelines, type OverrideMap } from '@/lib/evaluator'
import { resolveDisplayTransform } from '@/lib/render/resolveDisplayTransform'
import { Matrix2D } from './Matrix2D'
import type { LayerLookup } from '@/lib/scene/LayerIndex'

/** Layer-local → composition coordinates, matching CanvasRenderer's scene walk.
 * Optional lookup is borrowed from this exact scene/frame; it changes lookup
 * cost only. Ordering, cyclic-parent truncation and override semantics remain.
 */
export function resolveLayerWorldMatrix(
  layer: Layer,
  scene: ChronoScene,
  timeMs = 0,
  overrides?: OverrideMap,
  lookup?: LayerLookup,
): Matrix2D {
  const frameOverrides = overrides ?? evaluateTimelines(scene.timelines, timeMs)
  const chain: Layer[] = []
  const visited = new Set<string>()
  let current: Layer | undefined = layer
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    chain.unshift(current)
    const parentId: string | undefined = current.parentId
    current = parentId ? (lookup ? lookup.get(parentId) : scene.layers.find(candidate => candidate.id === parentId)) : undefined
  }

  let matrix = Matrix2D.identity()
  for (const item of chain) {
    const display = resolveDisplayTransform(item, scene, timeMs, frameOverrides, undefined, lookup)
    const { anchorX, anchorY } = item.transform
    matrix = matrix
      .translate(display.x + anchorX, display.y + anchorY)
      .rotate(display.rotationDeg)
      .scale(display.scaleX, display.scaleY)
      .translate(-anchorX, -anchorY)
  }
  return matrix
}
