// ── LinearArraySolver (BL-59) ─────────────────────────────────────────────────
//
// Computes transforms for a 1D linear array.
//
//   incremental: step values are applied per-copy.
//                move=(50,0), count=5 → x: 0, 50, 100, 150, 200
//
//   total:       values are the TOTAL span across all copies. The step
//                is divided across (count - 1) gaps.
//                move=(200,0), count=5 → step=(50,0) → same result.
//
// Source policy:
//   include-source     : index 0 is the source; produces (count - 1) clones.
//   clone-source-too   : every index is a clone; produces `count` new layers.

import type { Layer } from '../types'
import type {
  ArrayInstanceTransform,
  LinearArraySettings,
} from './ArrayTypes'

/**
 * Apply scale step (multiplicative) per index.
 *   incremental: scale_i = scale^i
 *   total:       step = total^(1/(count-1)); scale_i = step^i
 */
function computeScaleStep(
  settings: LinearArraySettings,
  axis: 'x' | 'y',
): number {
  const total = settings.scale[axis]
  if (settings.transformMode === 'incremental') return total
  const n = Math.max(1, settings.count - 1)
  // Defensive — avoid NaN when total <= 0.
  if (total <= 0) return 1
  return Math.pow(total, 1 / n)
}

export function solveLinear(
  source: Layer,
  settings: LinearArraySettings,
): ArrayInstanceTransform[] {
  if (settings.count <= 0) return []

  const denom = Math.max(1, settings.count - 1)

  // Step values per index, derived from transformMode.
  const stepX =
    settings.transformMode === 'incremental'
      ? settings.move.x
      : settings.move.x / denom
  const stepY =
    settings.transformMode === 'incremental'
      ? settings.move.y
      : settings.move.y / denom
  const stepRot =
    settings.transformMode === 'incremental'
      ? settings.rotationDeg
      : settings.rotationDeg / denom

  const scaleStepX = computeScaleStep(settings, 'x')
  const scaleStepY = computeScaleStep(settings, 'y')

  const baseX = source.transform.x
  const baseY = source.transform.y
  const baseRot = source.transform.rotationDeg
  const baseScaleX = source.transform.scaleX
  const baseScaleY = source.transform.scaleY
  const baseOpacity = source.opacity

  const out: ArrayInstanceTransform[] = []
  for (let i = 0; i < settings.count; i++) {
    const isSourceIndex =
      i === 0 && settings.sourcePolicy === 'include-source'

    out.push({
      index: i,
      position: { x: baseX + i * stepX, y: baseY + i * stepY },
      rotation: baseRot + i * stepRot,
      scale: {
        x: baseScaleX * Math.pow(scaleStepX, i),
        y: baseScaleY * Math.pow(scaleStepY, i),
      },
      opacity: baseOpacity,
      isSourceIndex,
    })
  }
  return out
}
