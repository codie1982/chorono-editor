/** Conservative scalar intervals and 2D boxes, in the caller's coordinate units.
 * Endpoints are ordered; arithmetic returns fresh records without rounding-mode
 * changes. Consumers must pad hull comparisons and verify accepted roots. */
export type Range = readonly [number, number]
export interface IntervalBox2D { x: Range; y: Range }
/** Interval addition, preserving endpoint ordering. */
export const add = (a: Range, b: Range): Range => [a[0] + b[0], a[1] + b[1]]
/** Reverse signed interval endpoints. */
export const neg = (a: Range): Range => [-a[1], -a[0]]
/** Signed scalar multiplication retains interval ordering. */
export const scale = (a: Range, k: number): Range => k >= 0 ? [a[0] * k, a[1] * k] : [a[1] * k, a[0] * k]
/** Product hull over both intervals. */
export const multiply = (a: Range, b: Range): Range => { const v = [a[0] * b[0], a[0] * b[1], a[1] * b[0], a[1] * b[1]]; return [Math.min(...v), Math.max(...v)] }
/** Largest absolute endpoint bounds interval magnitude. */
export const absMax = (a: Range) => Math.max(Math.abs(a[0]), Math.abs(a[1]))
