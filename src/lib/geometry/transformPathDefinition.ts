import type { PathDefinition } from './PathCommand'
import type { Matrix2D } from './Matrix2D'

/** Pure affine conversion of absolute normalized path coordinates. Transforms
 * endpoints and Q/C controls as points, preserves closure/order, and allocates
 * new commands. Caller defines source/destination spaces; no tessellation or
 * old spline vertex identities are introduced. */
export function transformPathDefinition(path: PathDefinition, matrix: Matrix2D): PathDefinition {
  return { closed: path.closed, commands: path.commands.map(command => {
    if (command.type === 'Z') return { ...command }
    const end = matrix.applyToPoint(command)
    if (command.type === 'M' || command.type === 'L') return { type: command.type, ...end }
    const one = matrix.applyToPoint({ x: command.x1, y: command.y1 })
    if (command.type === 'Q') return { type: 'Q', x1: one.x, y1: one.y, ...end }
    const two = matrix.applyToPoint({ x: command.x2, y: command.y2 })
    return { type: 'C', x1: one.x, y1: one.y, x2: two.x, y2: two.y, ...end }
  }) }
}
