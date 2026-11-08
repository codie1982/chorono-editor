import type { ChronoScene, Layer } from '@/lib/types'
import { evaluateTimelines, type OverrideMap } from '@/lib/evaluator'
import { resolveDisplayTransform } from '@/lib/render/resolveDisplayTransform'
import { Matrix2D } from './Matrix2D'
import type { LayerLookup } from '@/lib/scene/LayerIndex'
import { LayerIndex } from '@/lib/scene/LayerIndex'

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
  return resolveWorldMatrix(layer, scene, timeMs, frameOverrides, lookup)
}

/** Frame-local bulk resolver. Borrow one immutable scene/override snapshot;
 * discard this function after edits, time or parameter changes. Canonical
 * parent prefixes are evaluated once, using the SAME left-to-right matrix
 * operations as the standalone resolver, preserving floating-point phase.
 * The memo contains only matrices/layer identities and is bounded by queries.
 * Cyclic paths and effective clones outside the supplied index retain legacy
 * truncation/identity semantics and are never memoized. */
export function createLayerWorldMatrixResolver(scene: ChronoScene, timeMs = 0,
  overrides?: OverrideMap, lookup?: LayerLookup): (layer: Layer) => Matrix2D {
  const frame = overrides ?? evaluateTimelines(scene.timelines, timeMs)
  const index = lookup ?? new LayerIndex(scene.layers)
  const memo = new Map<Layer, Matrix2D>()
  return layer => resolveWorldMatrix(layer, scene, timeMs, frame, index,
    index.get(layer.id) === layer ? memo : undefined)
}

/** Shared traversal/composition implementation. Memoizing canonical prefixes
 * changes query cost only; cycles keep the old query-dependent truncation. */
function resolveWorldMatrix(layer: Layer, scene: ChronoScene, timeMs: number,
  frameOverrides: OverrideMap, lookup?: LayerLookup, memo?: Map<Layer, Matrix2D>): Matrix2D {
  const chain: Layer[] = []
  const visited = new Set<string>()
  let current: Layer | undefined = layer
  let matrix = Matrix2D.identity(), cyclic = false
  while (current) {
    if (visited.has(current.id)) { cyclic = true; break }
    visited.add(current.id)
    const cached = memo?.get(current)
    if (cached) { matrix = cached; break }
    chain.push(current)
    const parentId: string | undefined = current.parentId
    current = parentId ? (lookup ? lookup.get(parentId) : scene.layers.find(candidate => candidate.id === parentId)) : undefined
  }

  for (let i = chain.length - 1; i >= 0; i--) {
    const item = chain[i]
    const display = resolveDisplayTransform(item, scene, timeMs, frameOverrides, undefined, lookup)
    const { anchorX, anchorY } = item.transform
    matrix = matrix
      .translate(display.x + anchorX, display.y + anchorY)
      .rotate(display.rotationDeg)
      .scale(display.scaleX, display.scaleY)
      .translate(-anchorX, -anchorY)
    if (!cyclic) memo?.set(item, matrix)
  }
  return matrix
}
