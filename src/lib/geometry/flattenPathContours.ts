import type { PathDefinition } from './PathCommand'
import type { Vec2 } from './CoordinateSystem'
import { normalConeFits } from './bezier/normalConeFits'

/** Polygonal contour without a duplicate closing anchor. */
export interface FlattenedContour { points: Vec2[]; closed: boolean }

/** General adaptive path sampler. requireClosed preserves the legacy Boolean
 * contract. normalDistance additionally bounds derivative-normal variation for
 * offset approximation: chord error and displacement-normal error each stay
 * within tolerance. Zero derivative controls are ignored; reversals/cusps must
 * subdivide or explicitly fail at depth 24. Consecutive duplicates are omitted;
 * nonadjacent contacts remain for the topology validator. Tolerance describes
 * the authored Bézier, not its original analytic primitive. No mutation/DOM. */
export function flattenPathContours(path: PathDefinition, tolerance: number, maxVertices: number, maxRings: number,
  options: { requireClosed?: boolean; normalDistance?: number; label?: string } = {}): FlattenedContour[] {
  if (!Number.isFinite(tolerance) || tolerance < 0.01 || tolerance > 10) throw new Error('Curve tolerance must be 0.01–10 composition px.')
  if (![maxVertices, maxRings].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Invalid path sampling budget.')
  let ring: Vec2[] | null = null, point: Vec2 | null = null, count = 0
  const rings: FlattenedContour[] = []
  const finish = (closed: boolean) => {
    if (!ring || ring.length < (closed ? 3 : 2)) throw new Error('A contour needs enough distinct vertices.')
    rings.push({ points: ring, closed }); ring = null; point = null
  }
  if (options.normalDistance !== undefined && (!Number.isFinite(options.normalDistance) || options.normalDistance < 0)) throw new Error('Invalid normal displacement.')
  const add = (p: Vec2) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.max(Math.abs(p.x), Math.abs(p.y)) > 1e7) throw new Error('Coordinates must be finite and within ±10 million composition px.')
    if (!ring) throw new Error('A path command has no contour start.')
    const last = ring[ring.length - 1]
    if (!last || last.x !== p.x || last.y !== p.y) {
      if (++count > maxVertices) throw new Error(`${options.label ?? 'Boolean'} input vertex budget exceeded; increase tolerance or simplify inputs.`)
      ring.push(p)
    }
    point = p
  }
  const curve = (controls: Vec2[], depth = 0): void => {
    for (const p of controls) if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.max(Math.abs(p.x), Math.abs(p.y)) > 1e7) throw new Error('Invalid curve control coordinates.')
    const start = controls[0], end = controls[controls.length - 1]
    if (controls.slice(1, -1).every(p => chordDistance(p, start, end) <= tolerance) && normalConeFits(controls, options.normalDistance ?? 0, tolerance)) { add(end); return }
    if (depth === 24) throw new Error('Curve subdivision limit exceeded.')
    const rows = [controls]
    while (rows[rows.length - 1].length > 1) {
      const before = rows[rows.length - 1]
      rows.push(before.slice(1).map((p, i) => ({ x: (p.x + before[i].x) / 2, y: (p.y + before[i].y) / 2 })))
    }
    curve(rows.map(row => row[0]), depth + 1)
    curve(rows.map(row => row[row.length - 1]).reverse(), depth + 1)
  }
  for (const command of path.commands) {
    if (command.type === 'M') {
      if (ring) { if (options.requireClosed) throw new Error('Boolean inputs must have explicitly closed contours.'); finish(false) }
      if (rings.length >= maxRings) throw new Error(`${options.label ?? 'Boolean'} contour budget exceeded.`)
      ring = []; add({ x: command.x, y: command.y })
    } else if (command.type === 'Z') {
      if (!ring) throw new Error('Unexpected contour closure.')
      const first = ring[0], last = ring[ring.length - 1]
      if (ring.length > 1 && first.x === last.x && first.y === last.y) ring.pop()
      if (ring.length < 3) throw new Error('A Boolean contour needs at least three distinct vertices.')
      finish(true)
    } else {
      if (!point || !ring) throw new Error('A path command has no contour start.')
      const end = { x: command.x, y: command.y }
      if (command.type === 'L') add(end)
      else if (command.type === 'Q') curve([point, { x: command.x1, y: command.y1 }, end])
      else curve([point, { x: command.x1, y: command.y1 }, { x: command.x2, y: command.y2 }, end])
    }
  }
  if (ring) { if (options.requireClosed) throw new Error('Boolean inputs must contain closed contours.'); finish(false) }
  if (!rings.length) throw new Error('A path must contain contours.')
  return rings
}

/** Euclidean distance to a finite segment, preserving collinear overshoot. */
function chordDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}
