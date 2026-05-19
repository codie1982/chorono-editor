// ── Distribution Math (Pure) ────────────────────────────────────────────────
// Even out spacing between layer centers along a single axis. The outer
// two layers (left/right-most for horizontal, top/bottom-most for
// vertical) stay put — only the in-between layers move so their centers
// land on equal-stepped slots between the outer two.
//
// MVP scope:
//   • centers mode only — each layer's center gets evenly spaced
//   • requires ≥ 3 layers (2 layers are already "evenly spaced")
//   • gap-based / edge-based distribution → Phase 2

import type { ChronoScene, Composition } from '../../types'
import {
  bbCenterX, bbCenterY, bbRight, bbBottom,
  getLayerWorldBounds, isAlignable,
} from '../../geometry/LayerBounds'
import type { AlignDelta } from './AlignCompute'

export type DistributeAxis = 'horizontal' | 'vertical'
export type DistributeMode = 'centers'

export interface DistributeRequest {
  layerIds: string[]
  axis: DistributeAxis
  mode: DistributeMode
  composition: Composition
  scene: ChronoScene
}

export interface DistributeResult {
  transforms: AlignDelta[]
}

/**
 * Compute the deltas that evenly distribute the centers of the alignable
 * layers along the requested axis. Returns an empty transforms list when
 * fewer than 3 alignable layers are present.
 */
export function computeDistributeTransforms(req: DistributeRequest): DistributeResult {
  // Resolve alignable layers + their world centers along the chosen axis.
  const items = req.layerIds
    .map((id) => req.scene.layers.find((l) => l.id === id))
    .filter((l): l is NonNullable<typeof l> => !!l && isAlignable(l))
    .map((l) => {
      const b = getLayerWorldBounds(l, req.scene)
      return { id: l.id, center: req.axis === 'horizontal' ? bbCenterX(b) : bbCenterY(b) }
    })

  if (items.length < 3) return { transforms: [] }

  // Sort along the distribution axis so the outer two anchors are stable
  // regardless of selection order.
  items.sort((a, b) => a.center - b.center)

  const first = items[0].center
  const last  = items[items.length - 1].center
  const step  = (last - first) / (items.length - 1)

  const transforms: AlignDelta[] = []
  // Skip endpoints — they're the anchors and never move.
  for (let i = 1; i < items.length - 1; i++) {
    const target = first + step * i
    const delta  = target - items[i].center
    if (delta === 0) continue
    transforms.push({
      layerId: items[i].id,
      dx: req.axis === 'horizontal' ? delta : 0,
      dy: req.axis === 'vertical'   ? delta : 0,
    })
  }
  return { transforms }
}

// ── Spread Across Canvas ────────────────────────────────────────────────────
// Different from `computeDistributeTransforms`: instead of keeping the outer
// two selected layers fixed, this pushes the leftmost (or topmost) layer's
// visible edge against the canvas's matching edge, the rightmost (or
// bottommost) against the opposite edge, and evenly spaces the rest in
// between by center.
//
// Order is decided by current world position along the axis — the layer
// nearest the left edge becomes the first slot, regardless of selection
// or layer-list order.
//
// Requires ≥ 2 layers (the 2-layer case is meaningful: one snaps to each
// edge of the canvas).

export interface SpreadRequest {
  layerIds: string[]
  axis: DistributeAxis
  composition: Composition
  scene: ChronoScene
}

export interface SpreadResult {
  transforms: AlignDelta[]
}

export function computeSpreadAcrossCanvas(req: SpreadRequest): SpreadResult {
  // Collect alignable layers with their full world bounds — we need both
  // the center (for ordering + middle-slot placement) and the extents (for
  // edge snapping of the outer two).
  const items = req.layerIds
    .map((id) => req.scene.layers.find((l) => l.id === id))
    .filter((l): l is NonNullable<typeof l> => !!l && isAlignable(l))
    .map((l) => {
      const b = getLayerWorldBounds(l, req.scene)
      return {
        id: l.id,
        bounds: b,
        center: req.axis === 'horizontal' ? bbCenterX(b) : bbCenterY(b),
      }
    })

  if (items.length < 2) return { transforms: [] }

  // Sort along the spread axis so the leftmost / topmost layer wins slot 0.
  items.sort((a, b) => a.center - b.center)

  const canvasMin = 0
  const canvasMax = req.axis === 'horizontal' ? req.composition.width : req.composition.height

  // Snap targets — outer two go to canvas edges by their NEAR edge; middle
  // layers go to evenly stepped CENTER positions between the two outer
  // centers (after snapping).
  const firstItem = items[0]
  const lastItem  = items[items.length - 1]

  // First layer's left/top edge sits at canvasMin → its center moves to
  // canvasMin + half(width|height).
  // Last layer's right/bottom edge sits at canvasMax → its center moves to
  // canvasMax - half(width|height).
  const firstCenterTarget = req.axis === 'horizontal'
    ? canvasMin + firstItem.bounds.w / 2
    : canvasMin + firstItem.bounds.h / 2
  const lastCenterTarget = req.axis === 'horizontal'
    ? canvasMax - lastItem.bounds.w / 2
    : canvasMax - lastItem.bounds.h / 2

  const step = (lastCenterTarget - firstCenterTarget) / (items.length - 1)

  const transforms: AlignDelta[] = []
  for (let i = 0; i < items.length; i++) {
    const targetCenter = firstCenterTarget + step * i
    const delta = targetCenter - items[i].center
    if (delta === 0) continue
    transforms.push({
      layerId: items[i].id,
      dx: req.axis === 'horizontal' ? delta : 0,
      dy: req.axis === 'vertical'   ? delta : 0,
    })
  }
  // bbRight / bbBottom are imported for future edge-anchored variants
  // (e.g. spread keeping outer-edge alignment instead of centers). Silence
  // unused-warning by referencing them through a noop.
  void bbRight; void bbBottom
  return { transforms }
}
