import type { FlattenedContour } from '../../geometry/flattenPathContours'

/** Boolean cleanup removes redundant collinear centerline-derived vertices.
 * Restore bounded final boundary spacing without moving any boundary/corner:
 * equal subdivisions per straight span, plus half steps next to sharp (>30°)
 * boundary turns. This is output topology density, not another curve solver.
 * Local px; no mutation, quantization or simplification. Stage budget is shared
 * across all Objects; an impossible density refuses instead of truncating. */
export function densifyBandBoundary(contours: readonly FlattenedContour[], spacing: number, budget: { vertices: number }): FlattenedContour[] {
  return contours.map(contour => {
    const input = contour.points, points = []
    const sharp = (i: number) => {
      const p = input[(i + input.length - 1) % input.length], q = input[i], r = input[(i + 1) % input.length]
      const ux = q.x - p.x, uy = q.y - p.y, vx = r.x - q.x, vy = r.y - q.y
      return (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy)) < Math.cos(Math.PI / 6)
    }
    for (let i = 0; i < input.length; i++) {
      const a = input[i], b = input[(i + 1) % input.length], count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / spacing))
      if (!Number.isFinite(count) || count + budget.vertices > 8192) throw new Error('Outline boundary density exceeds 8192 vertices. Increase spacing.')
      const stops = Array.from({ length: count }, (_, k) => k / count)
      if (count > 1 && sharp(i)) stops.push(.5 / count)
      if (count > 1 && sharp((i + 1) % input.length)) stops.push(1 - .5 / count)
      stops.sort((x, y) => x - y)
      for (const t of stops) {
        if (++budget.vertices > 8192) throw new Error('Outline boundary density exceeds 8192 vertices. Increase spacing.')
        points.push(t === 0 ? { ...a } : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
      }
    }
    return { closed: contour.closed, points }
  })
}
