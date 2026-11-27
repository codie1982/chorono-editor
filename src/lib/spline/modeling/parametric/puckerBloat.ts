import type { SplinePathData } from '../../../types/spline'
import { computeSplineBounds } from '../../geometry/computeSplineBounds'
import { subShapeData } from '../../geometry/elementPaths'
import { mapSplineCoordinates } from '../../geometry/transformSplineData'
import { assertSplineLocks, assertSplineTopology, markEditedSubShapes } from '../../topology'
import { splineObjectSelection, validateSplineObjectEdit } from '../../edit/objectSelection'

export interface PuckerBloatOptions { amountPct: number; centerMode: 'object' | 'custom'; centerX: number; centerY: number }

/** Static radial control-cage deformation, not uniform layer scaling. Positive
 * amount bloats, negative puckers. Per Object, R is half its rendered bounds
 * diagonal and r is distance from the chosen center. Every anchor AND handle /
 * explicit control uses q=c+(p-c)*exp((amount/50)/(1+r/R)). The radial field is
 * monotone for -100..100%; Béziers retain degree but approximate that field via
 * their mapped controls. Broken linked tangent invariants become Bézier Corner;
 * independent values never get silently re-mirrored. IDs/owners/TRS/paint stay
 * with the source. Whole-boundary validation refuses crossings/collapsed holes.
 * Zero amount preserves identity; empty/degenerate bounds refuse. Local px,
 * immutable input, existing Object/lock/work budgets, no runtime resources. */
export function puckerBloatSplineObjects(data: SplinePathData, objectIds: readonly string[], options: PuckerBloatOptions): SplinePathData {
  if (!Number.isFinite(options.amountPct) || Math.abs(options.amountPct) > 100 || !['object', 'custom'].includes(options.centerMode)
    || ![options.centerX, options.centerY].every(n => Number.isFinite(n) && Math.abs(n) <= 1e7)) throw new Error('Invalid Pucker & Bloat amount or center.')
  assertSplineTopology(data); splineObjectSelection(data, objectIds)
  if (!options.amountPct) return data
  let output = data
  for (const id of objectIds) {
    const object = data.subShapes[id], bounds = computeSplineBounds(subShapeData(data, id)), radius = Math.hypot(bounds.width, bounds.height) / 2
    if (radius <= 1e-8) throw new Error('Pucker & Bloat needs non-degenerate Object bounds.')
    const center = options.centerMode === 'object' ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } : { x: options.centerX, y: options.centerY }
    const selected = new Set(object.contourIds.flatMap(contour => data.contours[contour].pointIds))
    output = mapSplineCoordinates(output, point => {
      const dx = point.x - center.x, dy = point.y - center.y, scale = Math.exp((options.amountPct / 50) / (1 + Math.hypot(dx, dy) / radius))
      return { x: center.x + dx * scale, y: center.y + dy * scale }
    }, selected)
    const handles = new Map(Object.values(output.handles).map(handle => [`${handle.pointId}:${handle.kind}`, handle]))
    for (const pointId of Array.from(selected)) {
      const point = output.points[pointId], a = handles.get(`${pointId}:in`), b = handles.get(`${pointId}:out`)
      if (!a || !b || !['bezier', 'smooth'].includes(point.type)) continue
      const ax = a.x - point.x, ay = a.y - point.y, bx = b.x - point.x, by = b.y - point.y, la = Math.hypot(ax, ay), lb = Math.hypot(bx, by)
      if (ax * bx + ay * by > 0 || Math.abs(ax * by - ay * bx) > 1e-6 * Math.max(1, la * lb) || point.type === 'bezier' && Math.abs(la - lb) > 1e-6 * Math.max(1, la, lb))
        output.points[pointId] = { ...point, type: 'bezierCorner' }
    }
  }
  output = markEditedSubShapes(data, output)
  assertSplineTopology(output); assertSplineLocks(data, output); validateSplineObjectEdit(data, output, objectIds, 'Pucker & Bloat')
  return output
}
