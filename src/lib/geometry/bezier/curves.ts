import type { Vec2 } from '../CoordinateSystem'

/** One interpolation level shared by evaluation and exact subdivision. */
function nextRow(row: readonly Vec2[], t: number): Vec2[] {
  return row.slice(1).map((p, i) => ({ x: row[i].x + (p.x - row[i].x) * t, y: row[i].y + (p.y - row[i].y) * t }))
}

/** De Casteljau subdivision for one line/quadratic/cubic control polygon.
 * Pure: returned arrays never alias mutable input arrays. t is in [0,1]; all
 * consumers use the same absolute-coordinate convention, in any affine space.
 * Zero-length curves are allowed here; geometry authoring validates them. */
export function splitBezier(points: readonly Vec2[], t: number): [Vec2[], Vec2[]] {
  const left = [points[0]], right = [points[points.length - 1]]
  let row = [...points]
  while (row.length > 1) {
    row = nextRow(row, t)
    left.push(row[0]); right.unshift(row[row.length - 1])
  }
  return [left, right]
}

/** Evaluate the exact polynomial at t without mutating controls. */
export function evaluateBezier(points: readonly Vec2[], t: number): Vec2 {
  let row = points
  while (row.length > 1) row = nextRow(row, t)
  return row[0]
}

/** Exact same-degree subcurve over 0 <= from < to <= 1. Numerical arc-length
 * lookup is deliberately separate; subdivision never flattens the curve. */
export function trimBezier(points: readonly Vec2[], from: number, to: number): Vec2[] {
  const left = to === 1 ? [...points] : splitBezier(points, to)[0]
  return from === 0 ? left : splitBezier(left, from / to)[1]
}

/** Exact degree elevation of a finite line/quadratic/cubic control polygon to
 * cubic controls in the same coordinate space. Preserves P(t), including its
 * parameterization; returns private point records. Unsupported degrees refuse. */
export function elevateBezierToCubic(points: readonly Vec2[]): Vec2[] {
  if (points.length < 2 || points.length > 4 || points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error('Degree elevation needs finite line/quadratic/cubic controls.')
  const first = points[0], last = points.at(-1)!
  if (points.length === 4) return points.map(point => ({ ...point }))
  if (points.length === 2) return [{ ...first }, evaluateBezier(points, 1 / 3), evaluateBezier(points, 2 / 3), { ...last }]
  const control = points[1]
  return [{ ...first }, { x: first.x + (control.x - first.x) * 2 / 3, y: first.y + (control.y - first.y) * 2 / 3 },
    { x: last.x + (control.x - last.x) * 2 / 3, y: last.y + (control.y - last.y) * 2 / 3 }, { ...last }]
}
