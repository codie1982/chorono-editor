import type { PathDefinition } from './PathCommand'
import type { Matrix2D } from './Matrix2D'
import type { Vec2 } from './CoordinateSystem'

export interface PathBounds {
  x: number
  y: number
  width: number
  height: number
}

function quadraticAt(p0: number, p1: number, p2: number, t: number): number {
  const a = p0 + (p1 - p0) * t
  const b = p1 + (p2 - p1) * t
  return a + (b - a) * t
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const a = quadraticAt(p0, p1, p2, t)
  const b = quadraticAt(p1, p2, p3, t)
  return a + (b - a) * t
}

/** Roots of the cubic derivative, excluding the already-included endpoints. */
function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3
  const b = 2 * (p0 - 2 * p1 + p2)
  const c = p1 - p0
  const epsilon = 1e-12 * Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c))
  if (Math.abs(a) <= epsilon) {
    return Math.abs(b) <= epsilon ? [] : [-c / b]
  }
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return []
  const sqrt = Math.sqrt(discriminant)
  // Avoid cancellation when one root is much smaller than the other.
  const q = -0.5 * (b + (b < 0 ? -sqrt : sqrt))
  return q === 0 ? [-b / (2 * a)] : [q / a, c / q]
}

/** Tight AABB of the actual path. Controls are transformed before extrema are
 * solved, so rotated curves keep their true bounds rather than a rotated box. */
export function computePathBounds(path: PathDefinition, matrix?: Matrix2D): PathBounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let current: Vec2 = { x: 0, y: 0 }
  let start: Vec2 = current
  const transform = (point: Vec2) => matrix ? matrix.applyToPoint(point) : point
  const include = (point: Vec2) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  for (const command of path.commands) {
    if (command.type === 'Z') {
      current = start
      continue
    }
    const end = transform(command)
    include(end)
    if (command.type === 'M') {
      current = start = end
      continue
    }
    if (command.type === 'Q') {
      const control = transform({ x: command.x1, y: command.y1 })
      for (const axis of ['x', 'y'] as const) {
        const denominator = current[axis] - 2 * control[axis] + end[axis]
        if (denominator === 0) continue
        const t = (current[axis] - control[axis]) / denominator
        if (t > 0 && t < 1) include({
          x: quadraticAt(current.x, control.x, end.x, t),
          y: quadraticAt(current.y, control.y, end.y, t),
        })
      }
    } else if (command.type === 'C') {
      const control1 = transform({ x: command.x1, y: command.y1 })
      const control2 = transform({ x: command.x2, y: command.y2 })
      const extrema = [
        ...cubicExtrema(current.x, control1.x, control2.x, end.x),
        ...cubicExtrema(current.y, control1.y, control2.y, end.y),
      ]
      for (const t of extrema) if (t > 0 && t < 1) include({
        x: cubicAt(current.x, control1.x, control2.x, end.x, t),
        y: cubicAt(current.y, control1.y, control2.y, end.y, t),
      })
    }
    current = end
  }

  return minX === Infinity
    ? { x: 0, y: 0, width: 0, height: 0 }
    : { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
