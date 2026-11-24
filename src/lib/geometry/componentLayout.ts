import { Matrix2D } from './Matrix2D'
import type { Vec2 } from './CoordinateSystem'

export type ComponentLayout = 'alignX' | 'alignY' | 'distributeX' | 'distributeY'

/** Translate each selected component as a unit in the supplied edit frame.
 * Alignment uses the combined bounds center; distribution spaces component
 * centers evenly between the extremes. Shared points with conflicting moves
 * reject atomically. Results are displacement vectors in layer-local pixels. */
export function componentLayout(
  groups: readonly (readonly string[])[],
  points: ReadonlyMap<string, Vec2>,
  frame: Matrix2D,
  action: ComponentLayout,
) {
  const axis = action.endsWith('X') ? 'x' : 'y',
    distribute = action.startsWith('distribute')
  if (groups.length < (distribute ? 3 : 2))
    throw new Error(distribute ? 'Select at least three components.' : 'Select at least two components.')
  const components = groups
    .map((ids) => {
      let min = Infinity,
        max = -Infinity
      for (const id of ids) {
        const p = points.get(id)
        if (!p) throw new Error('Mesh or spline selection changed.')
        const v = frame.applyToPoint(p)[axis]
        min = Math.min(min, v)
        max = Math.max(max, v)
      }
      if (!Number.isFinite(min + max)) throw new Error('Choose nonempty components.')
      return { ids, min, max, center: (min + max) / 2 }
    })
    .sort((a, b) => a.center - b.center)
  const center =
    (components.reduce((v, c) => Math.min(v, c.min), Infinity) +
      components.reduce((v, c) => Math.max(v, c.max), -Infinity)) /
    2
  const first = components[0].center,
    span = components[components.length - 1].center - first,
    inverse = frame.invert()
  const deltas = new Map<string, Vec2>()
  components.forEach((c, i) => {
    const amount = (distribute ? first + (i * span) / (components.length - 1) : center) - c.center
    const d = inverse.applyToVector({ x: axis === 'x' ? amount : 0, y: axis === 'y' ? amount : 0 })
    for (const id of c.ids) {
      const prev = deltas.get(id)
      if (prev && Math.hypot(prev.x - d.x, prev.y - d.y) > 1e-8)
        throw new Error('Shared vertices need conflicting moves. Select independent components.')
      deltas.set(id, d)
    }
  })
  return deltas
}
