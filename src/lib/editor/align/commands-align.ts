// ── Align / Distribute Commands ─────────────────────────────────────────────
// EditorCommand factories that translate the pure-math AlignResult /
// DistributeResult into an undoable scene mutation. Each command snapshots
// the prior transform of every affected layer so undo restores positions
// exactly — even if a layer was already animated.
//
// Anchor / parent transforms are NOT touched. Only `transform.x` and
// `transform.y` move, which means rigs whose rotation pivots / scale
// pivots / scene-graph parents matter keep behaving identically.

import type { ChronoScene, Transform } from '../../types'
import type { EditorCommand } from '../commands-keyframe'
import {
  type AlignRequest, type AlignDelta, type AlignOperation,
  computeAlignTransforms,
} from './AlignCompute'
import {
  type DistributeRequest, type DistributeAxis,
  type SpreadRequest,
  computeDistributeTransforms,
  computeSpreadAcrossCanvas,
} from './DistributeCompute'

const ALIGN_LABELS: Record<AlignOperation, string> = {
  left:    'Align Left',
  centerX: 'Align Horizontal Centers',
  right:   'Align Right',
  top:     'Align Top',
  centerY: 'Align Vertical Centers',
  bottom:  'Align Bottom',
}

const DISTRIBUTE_LABELS: Record<DistributeAxis, string> = {
  horizontal: 'Distribute Horizontally',
  vertical:   'Distribute Vertically',
}

const SPREAD_LABELS: Record<DistributeAxis, string> = {
  horizontal: 'Spread Across Canvas (Horizontal)',
  vertical:   'Spread Across Canvas (Vertical)',
}

/**
 * Build a command that applies a list of per-layer (dx, dy) deltas and
 * remembers the original `transform` of each touched layer so undo
 * restores it 1:1.
 */
function makeDeltaCmd(label: string, deltas: AlignDelta[]): EditorCommand {
  const deltaMap = new Map(deltas.map((d) => [d.layerId, d]))
  let snapshot: Map<string, Transform> | null = null

  return {
    label,
    execute(scene: ChronoScene): ChronoScene {
      const snap = new Map<string, Transform>()
      const layers = scene.layers.map((l) => {
        const d = deltaMap.get(l.id)
        if (!d) return l
        snap.set(l.id, l.transform)
        return {
          ...l,
          transform: {
            ...l.transform,
            x: l.transform.x + d.dx,
            y: l.transform.y + d.dy,
          },
        }
      })
      snapshot = snap
      return { ...scene, layers }
    },
    undo(scene: ChronoScene): ChronoScene {
      if (!snapshot) return scene
      const snap = snapshot
      return {
        ...scene,
        layers: scene.layers.map((l) => {
          const prev = snap.get(l.id)
          return prev ? { ...l, transform: prev } : l
        }),
      }
    },
  }
}

/**
 * Make a command that aligns the requested layers. Returns null when the
 * request has no effect (no alignable layers, or everything's already
 * aligned) — caller can early-out without pushing onto history.
 */
export function makeAlignCmd(req: AlignRequest): EditorCommand | null {
  const result = computeAlignTransforms(req)
  if (result.transforms.length === 0) return null
  return makeDeltaCmd(ALIGN_LABELS[req.operation], result.transforms)
}

/**
 * Make a command that distributes the requested layers along an axis.
 * Returns null when fewer than 3 alignable layers are present or every
 * center is already evenly spaced.
 */
export function makeDistributeCmd(req: DistributeRequest): EditorCommand | null {
  const result = computeDistributeTransforms(req)
  if (result.transforms.length === 0) return null
  return makeDeltaCmd(DISTRIBUTE_LABELS[req.axis], result.transforms)
}

/**
 * Make a command that spreads the requested layers across the composition.
 * The leftmost (or topmost) layer's near edge snaps to the canvas's near
 * edge, the rightmost (or bottommost) to the far edge, and centers in
 * between are evenly stepped. Requires ≥ 2 alignable layers.
 */
export function makeSpreadCmd(req: SpreadRequest): EditorCommand | null {
  const result = computeSpreadAcrossCanvas(req)
  if (result.transforms.length === 0) return null
  return makeDeltaCmd(SPREAD_LABELS[req.axis], result.transforms)
}
