// ── Alignment Math (Pure) ───────────────────────────────────────────────────
// Computes the per-layer translation deltas needed to align a set of
// selected layers against a reference bounding box. Pure & side-effect
// free — the caller wraps the result into an EditorCommand.
//
// Reference modes (MVP):
//   • selection — the union AABB of every alignable selected layer
//   • canvas    — the composition rectangle (0,0)→(width,height)
//
// Anchor handling: alignment moves transform.x/y only (the world top-left
// of the layer's bbox). Anchors are static pivots and stay untouched, so
// rigs that depend on a specific pivot location keep behaving identically.

import type { ChronoScene, Composition } from '../../types'
import {
  type WorldBounds,
  bbCenterX, bbCenterY, bbRight, bbBottom,
  getCanvasBounds, getLayerWorldBounds, getSelectionBounds, isAlignable,
} from '../../geometry/LayerBounds'

export type AlignOperation =
  | 'left' | 'centerX' | 'right'
  | 'top'  | 'centerY' | 'bottom'

export type AlignToMode = 'selection' | 'canvas'

export interface AlignRequest {
  layerIds: string[]
  operation: AlignOperation
  alignTo: AlignToMode
  composition: Composition
  scene: ChronoScene
}

export interface AlignDelta {
  layerId: string
  dx: number
  dy: number
}

export interface AlignResult {
  transforms: AlignDelta[]
}

/**
 * Resolve the reference bounding box the layers will align against.
 * Returns null when the selection mode yields no alignable layers.
 */
function resolveReference(req: AlignRequest): WorldBounds | null {
  if (req.alignTo === 'canvas') return getCanvasBounds(req.composition)
  return getSelectionBounds(req.layerIds, req.scene)
}

/**
 * Delta required to move `obj` so its chosen edge / center matches `ref`
 * along the relevant axis. Returns (0,0) for axes the operation doesn't
 * touch.
 */
function deltaFor(
  obj: WorldBounds,
  ref: WorldBounds,
  op: AlignOperation,
): { dx: number; dy: number } {
  switch (op) {
    case 'left':    return { dx: ref.x - obj.x,                       dy: 0 }
    case 'right':   return { dx: bbRight(ref)  - bbRight(obj),        dy: 0 }
    case 'centerX': return { dx: bbCenterX(ref) - bbCenterX(obj),     dy: 0 }
    case 'top':     return { dx: 0, dy: ref.y - obj.y                       }
    case 'bottom':  return { dx: 0, dy: bbBottom(ref)  - bbBottom(obj)      }
    case 'centerY': return { dx: 0, dy: bbCenterY(ref) - bbCenterY(obj)     }
  }
}

/**
 * Compute the deltas needed to align every alignable layer in the request.
 * Returns an empty transforms list when nothing can be aligned (no valid
 * reference, no alignable layers, or every delta rounds to zero).
 */
export function computeAlignTransforms(req: AlignRequest): AlignResult {
  const reference = resolveReference(req)
  if (!reference) return { transforms: [] }

  const transforms: AlignDelta[] = []
  for (const id of req.layerIds) {
    const layer = req.scene.layers.find((l) => l.id === id)
    if (!layer || !isAlignable(layer)) continue
    const obj = getLayerWorldBounds(layer, req.scene)
    const { dx, dy } = deltaFor(obj, reference, req.operation)
    if (dx === 0 && dy === 0) continue
    transforms.push({ layerId: id, dx, dy })
  }
  return { transforms }
}
