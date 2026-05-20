// ── SplinePathData → PathDefinition ──────────────────────────────────────────
//
// Rendering bridge for the granular spline model. Walks each subShape's
// contours, emitting M/L/C/Q/Z commands. Cubic segments derive their control
// points from the from-point's 'out' handle and the to-point's 'in' handle
// (handles are canonical); quadratic segments use segment.control1.

import type { SplinePathData, SplineHandle } from '@/lib/types/spline'
import type { PathDefinition } from '@/lib/geometry/PathCommand'
import { M, L, C, Q, Z } from '@/lib/geometry/PathCommand'

function handleMap(data: SplinePathData): Map<string, SplineHandle> {
  const m = new Map<string, SplineHandle>()
  for (const h of Object.values(data.handles)) {
    m.set(`${h.pointId}:${h.kind}`, h)
  }
  return m
}

export function splineToPathDefinition(data: SplinePathData): PathDefinition {
  const commands: PathDefinition['commands'] = []
  let hasClosed = false
  const handles = handleMap(data)

  for (const sub of Object.values(data.subShapes)) {
    for (const contourId of sub.contourIds) {
      const contour = data.contours[contourId]
      if (!contour || contour.pointIds.length === 0) continue

      const first = data.points[contour.pointIds[0]]
      if (!first) continue
      commands.push(M(first.x, first.y))

      for (const segId of contour.segmentIds) {
        const seg = data.segments[segId]
        if (!seg) continue
        const from = data.points[seg.fromPointId]
        const to   = data.points[seg.toPointId]
        if (!from || !to) continue

        if (seg.type === 'line') {
          commands.push(L(to.x, to.y))
        } else if (seg.type === 'quadratic') {
          const ctrl = seg.control1 ?? { x: from.x, y: from.y }
          commands.push(Q(ctrl.x, ctrl.y, to.x, to.y))
        } else {
          // cubic — derive controls from handles
          const out = handles.get(`${from.id}:out`)
          const inn = handles.get(`${to.id}:in`)
          const c1x = out ? out.x : from.x
          const c1y = out ? out.y : from.y
          const c2x = inn ? inn.x : to.x
          const c2y = inn ? inn.y : to.y
          commands.push(C(c1x, c1y, c2x, c2y, to.x, to.y))
        }
      }

      if (contour.closed) {
        commands.push(Z())
        hasClosed = true
      }
    }
  }

  return { commands, closed: hasClosed }
}
