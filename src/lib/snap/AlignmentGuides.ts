// ── Alignment Guides ──────────────────────────────────────────────────────────
//
// Snaps a dragging layer to:
//   - Canvas center (vertical + horizontal centerlines)
//   - Canvas edges (left / right / top / bottom)
//   - Other layers' edges (left / right / top / bottom) and centerlines
//
// When the moving rectangle's edge or center is within `threshold` of a snap
// target, the position is adjusted to align EXACTLY, and a Guide record is
// returned so the canvas overlay can render a pink line.
//
// Pure: no DOM, no React. Renderer-agnostic — works on world-coords rectangles.

export interface Rect {
  x: number; y: number; width: number; height: number
}

/** A single alignment guide line, drawn by the canvas overlay. */
export interface Guide {
  /** Direction: 'v' = vertical line at fixed X, 'h' = horizontal at fixed Y. */
  axis: 'v' | 'h'
  /** Position in composition (world) coordinates. */
  position: number
  /** Where this guide came from (debug + filtering). */
  source: 'canvas-edge' | 'canvas-center' | 'layer-edge' | 'layer-center'
}

export interface SnapResult {
  /** Final x position for the moving rect (possibly snapped). */
  x: number
  /** Final y position for the moving rect (possibly snapped). */
  y: number
  /** Active guides to render this frame. */
  guides: Guide[]
}

export interface SnapTarget {
  axis: 'v' | 'h'
  position: number   // line position (world coords)
  source: Guide['source']
}

/**
 * Build the candidate target list once per drag (cheap — under 100 items even
 * with many layers). Each layer contributes up to 6 lines (left/right/cx/cy/top/bottom).
 */
export function buildSnapTargets(
  compositionWidth:  number,
  compositionHeight: number,
  otherLayers: Array<Rect & { id: string }>,
): SnapTarget[] {
  const out: SnapTarget[] = []

  // ── Canvas edges ──
  out.push({ axis: 'v', position: 0,                 source: 'canvas-edge' })
  out.push({ axis: 'v', position: compositionWidth,  source: 'canvas-edge' })
  out.push({ axis: 'h', position: 0,                 source: 'canvas-edge' })
  out.push({ axis: 'h', position: compositionHeight, source: 'canvas-edge' })

  // ── Canvas centerlines ──
  out.push({ axis: 'v', position: compositionWidth  / 2, source: 'canvas-center' })
  out.push({ axis: 'h', position: compositionHeight / 2, source: 'canvas-center' })

  // ── Other layer edges + centers ──
  for (const r of otherLayers) {
    const cx = r.x + r.width  / 2
    const cy = r.y + r.height / 2
    out.push({ axis: 'v', position: r.x,             source: 'layer-edge'   })
    out.push({ axis: 'v', position: r.x + r.width,   source: 'layer-edge'   })
    out.push({ axis: 'v', position: cx,              source: 'layer-center' })
    out.push({ axis: 'h', position: r.y,             source: 'layer-edge'   })
    out.push({ axis: 'h', position: r.y + r.height,  source: 'layer-edge'   })
    out.push({ axis: 'h', position: cy,              source: 'layer-center' })
  }

  return out
}

/**
 * Apply snap targets to a moving rect. Returns (x, y) adjusted to snap when
 * any of the rect's left/centerX/right (or top/centerY/bottom) lies within
 * `threshold` of a target line.
 *
 * `threshold` is in WORLD pixels — caller scales by 1/zoom for screen-px feel.
 */
export function snapRect(
  rect: Rect,
  targets: SnapTarget[],
  threshold: number,
): SnapResult {
  let bestVDx = Infinity, bestVTarget: SnapTarget | null = null, vAdjust = 0
  let bestHDy = Infinity, bestHTarget: SnapTarget | null = null, hAdjust = 0

  const left   = rect.x
  const right  = rect.x + rect.width
  const cx     = rect.x + rect.width  / 2
  const top    = rect.y
  const bottom = rect.y + rect.height
  const cy     = rect.y + rect.height / 2

  for (const t of targets) {
    if (t.axis === 'v') {
      // Try snapping each vertical anchor (left, cx, right)
      for (const { anchor, delta } of [
        { anchor: 'left',  delta: t.position - left  },
        { anchor: 'cx',    delta: t.position - cx    },
        { anchor: 'right', delta: t.position - right },
      ]) {
        const abs = Math.abs(delta)
        if (abs < threshold && abs < bestVDx) {
          bestVDx = abs
          bestVTarget = t
          vAdjust = delta
        }
      }
    } else {
      for (const { anchor, delta } of [
        { anchor: 'top',    delta: t.position - top    },
        { anchor: 'cy',     delta: t.position - cy     },
        { anchor: 'bottom', delta: t.position - bottom },
      ]) {
        const abs = Math.abs(delta)
        if (abs < threshold && abs < bestHDy) {
          bestHDy = abs
          bestHTarget = t
          hAdjust = delta
        }
      }
    }
  }

  const guides: Guide[] = []
  if (bestVTarget) guides.push({ axis: 'v', position: bestVTarget.position, source: bestVTarget.source })
  if (bestHTarget) guides.push({ axis: 'h', position: bestHTarget.position, source: bestHTarget.source })

  return {
    x: rect.x + (bestVTarget ? vAdjust : 0),
    y: rect.y + (bestHTarget ? hAdjust : 0),
    guides,
  }
}
