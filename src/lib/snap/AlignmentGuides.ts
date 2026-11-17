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
  source: 'canvas-edge' | 'canvas-center' | 'layer-edge' | 'layer-center' | 'custom-guide' | 'parent-edge' | 'grid' | 'pixel'
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
  /** Grid quantizes the source origin, whereas bounds align edges/centers. */
  originOnly?: boolean
}

/** Emit world-axis bounds edges/centers in deterministic order. Parent/object
 * bounds are evaluated by the caller, including displayed transforms. */
function rectangleTargets(r: Rect, edge: Guide['source'], center: Guide['source'] | null, edges: boolean): SnapTarget[] {
  return [
    ...(edges ? [{ axis: 'v' as const, position: r.x, source: edge }, { axis: 'v' as const, position: r.x + r.width, source: edge },
      { axis: 'h' as const, position: r.y, source: edge }, { axis: 'h' as const, position: r.y + r.height, source: edge }] : []),
    ...(center ? [{ axis: 'v' as const, position: r.x + r.width / 2, source: center }, { axis: 'h' as const, position: r.y + r.height / 2, source: center }] : []),
  ]
}

/**
 * Build world-axis targets in O(layers + parents). Default options preserve
 * legacy edges and centers; explicit policies keep checkbox types independent.
 * Parents precede ordinary bounds, winning exact distance ties.
 */
export function buildSnapTargets(
  compositionWidth:  number,
  compositionHeight: number,
  otherLayers: Array<Rect & { id: string }>,
  policy: { edges?: boolean; centers?: boolean; parents?: readonly Rect[] } = {},
): SnapTarget[] {
  return [
    ...(policy.parents ?? []).flatMap(r => rectangleTargets(r, 'parent-edge', null, true)),
    ...rectangleTargets({ x: 0, y: 0, width: compositionWidth, height: compositionHeight }, 'canvas-edge', policy.centers === false ? null : 'canvas-center', policy.edges !== false),
    ...otherLayers.flatMap(r => rectangleTargets(r, 'layer-edge', policy.centers === false ? null : 'layer-center', policy.edges !== false)),
  ].filter(target => Number.isFinite(target.position))
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
      for (const { delta } of (t.originOnly ? [{ delta: t.position - left }] : [
        { anchor: 'left',  delta: t.position - left  },
        { anchor: 'cx',    delta: t.position - cx    },
        { anchor: 'right', delta: t.position - right },
      ])) {
        const abs = Math.abs(delta)
        if (abs < threshold && abs < bestVDx) {
          bestVDx = abs
          bestVTarget = t
          vAdjust = delta
        }
      }
    } else {
      for (const { delta } of (t.originOnly ? [{ delta: t.position - top }] : [
        { anchor: 'top',    delta: t.position - top    },
        { anchor: 'cy',     delta: t.position - cy     },
        { anchor: 'bottom', delta: t.position - bottom },
      ])) {
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
