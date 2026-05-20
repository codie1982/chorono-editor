// ── SplinePathData → PathDefinition ──────────────────────────────────────────
//
// The rendering bridge: converts a SplineLayer's stored data into the
// normalized command stream that buildPathOnCanvas / trim / motion-path / SVG
// export all consume.
//
// Algorithm:
//   1. Sort subShapes by order (combine-mode sequence)
//   2. For each subShape, iterate its contourIds in declaration order
//   3. Convert each BezierPath contour to M/L/C/Z commands
//   4. Concatenate all commands — multiple M...Z sequences form a compound path
//   5. fillRule is returned on the PathDefinition for the renderer to apply

import type { SplinePathData } from '@/lib/types/spline'
import type { PathDefinition }  from '@/lib/geometry/PathCommand'
import { bezierPathToPathDefinition } from '@/lib/geometry/bezierPathToPathDefinition'

export function splineToPathDefinition(data: SplinePathData): PathDefinition {
  const sortedSubShapes = Object.values(data.subShapes)
    .sort((a, b) => a.order - b.order)

  const commands: PathDefinition['commands'] = []
  let hasClosed = false

  for (const sub of sortedSubShapes) {
    for (const contourId of sub.contourIds) {
      const contour = data.contours[contourId]
      if (!contour) continue
      const contourPath = bezierPathToPathDefinition(contour)
      commands.push(...contourPath.commands)
      if (contourPath.closed) hasClosed = true
    }
  }

  return { commands, closed: hasClosed }
}
