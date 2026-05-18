// ── GridArraySolver (BL-59) ───────────────────────────────────────────────────
//
// 2D rectangular grid of clones (columns × rows).
//
// Index order: row-major.
//   row 0: indices [0, 1, ..., columns-1]
//   row 1: indices [columns, columns+1, ..., 2*columns-1]
//   ...
//
// Position formula:
//   x = baseX + col * columnMove.x + row * rowMove.x  (+ stagger if applicable)
//   y = baseY + col * columnMove.y + row * rowMove.y
//
// Stagger:
//   When `enabled`, every odd-row OR every even-row (per `mode`) is shifted
//   by `offset`. Useful for brick layouts, isometric tiles, hex grids.

import type { Layer } from '../types'
import type {
  ArrayInstanceTransform,
  GridArraySettings,
} from './ArrayTypes'

export function solveGrid(
  source: Layer,
  settings: GridArraySettings,
): ArrayInstanceTransform[] {
  if (settings.columns <= 0 || settings.rows <= 0) return []

  const baseX = source.transform.x
  const baseY = source.transform.y
  const baseRot = source.transform.rotationDeg
  const baseScaleX = source.transform.scaleX
  const baseScaleY = source.transform.scaleY
  const baseOpacity = source.opacity

  const out: ArrayInstanceTransform[] = []

  for (let row = 0; row < settings.rows; row++) {
    // Stagger: offset alternate rows.
    let staggerX = 0
    let staggerY = 0
    if (settings.stagger?.enabled) {
      const rowIsOdd = row % 2 === 1
      const matches =
        (settings.stagger.mode === 'odd-rows' && rowIsOdd) ||
        (settings.stagger.mode === 'even-rows' && !rowIsOdd)
      if (matches) {
        staggerX = settings.stagger.offset.x
        staggerY = settings.stagger.offset.y
      }
    }

    for (let col = 0; col < settings.columns; col++) {
      const index = row * settings.columns + col

      const isSourceIndex =
        index === 0 && settings.sourcePolicy === 'include-source'

      out.push({
        index,
        position: {
          x: baseX + col * settings.columnMove.x + row * settings.rowMove.x + staggerX,
          y: baseY + col * settings.columnMove.y + row * settings.rowMove.y + staggerY,
        },
        rotation: baseRot,
        scale: { x: baseScaleX, y: baseScaleY },
        opacity: baseOpacity,
        isSourceIndex,
      })
    }
  }

  return out
}
