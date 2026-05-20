// ── BezierPath → PathDefinition ───────────────────────────────────────────────
//
// Converts a BezierPath (anchor-based editing format used by the Pen Tool and
// spline contours) into a PathDefinition (M/L/C/Z command stream used by the
// renderer, trim path, motion path, and SVG export).
//
// Extracted from renderer.ts:buildBezierPath so both the bezierPathRendererPlugin
// and the new splineRendererPlugin share the same conversion logic.

import type { BezierPath }    from '@/lib/types/path'
import type { PathDefinition } from './PathCommand'
import { M, L, C, Z }         from './PathCommand'

/**
 * Converts a single BezierPath to a PathDefinition.
 * Returns an empty path if there are no anchors.
 */
export function bezierPathToPathDefinition(path: BezierPath): PathDefinition {
  const { anchors, closed } = path
  if (anchors.length === 0) return { commands: [], closed: false }

  const commands = []
  commands.push(M(anchors[0].x, anchors[0].y))

  const segCount = closed ? anchors.length : anchors.length - 1
  for (let i = 0; i < segCount; i++) {
    const a = anchors[i]
    const b = anchors[(i + 1) % anchors.length]
    const hasOut = a.outX !== undefined && a.outY !== undefined
    const hasIn  = b.inX  !== undefined && b.inY  !== undefined

    if (hasOut || hasIn) {
      const c1x = hasOut ? a.outX! : a.x
      const c1y = hasOut ? a.outY! : a.y
      const c2x = hasIn  ? b.inX!  : b.x
      const c2y = hasIn  ? b.inY!  : b.y
      commands.push(C(c1x, c1y, c2x, c2y, b.x, b.y))
    } else {
      commands.push(L(b.x, b.y))
    }
  }

  if (closed) commands.push(Z())

  return { commands, closed }
}
