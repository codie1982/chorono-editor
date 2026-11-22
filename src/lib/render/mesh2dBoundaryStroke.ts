import type { Layer } from '../types'
import type { OverrideMap } from '../evaluator'
import { pathDefinitionToSpline } from '../geometry/conversion/ShapeToSplineConverter'
import { drawSplineLayer } from '../renderer'
import type { PathDefinition } from '../geometry/PathCommand'

/** Stroke only true mesh boundaries, including holes, through the canonical
 * spline paint/trim implementation. Rings use topology indices so deformation
 * follows the current borrowed positions. Internal triangulation edges never
 * paint. No source mutation, topology recomputation, assets or caches owned. */
export function drawMesh2DBoundaryStroke(ctx: CanvasRenderingContext2D, layer: Layer,
  overrides: OverrideMap, positions: ArrayLike<number>): void {
  if (!layer.style?.stroke || !layer.mesh2d?.boundaryRings?.length) return
  const commands: PathDefinition['commands'] = layer.mesh2d.boundaryRings.flatMap(ring => [
    ...ring.map((vertex, i) => ({ type: i === 0 ? 'M' as const : 'L' as const, x: positions[vertex * 2], y: positions[vertex * 2 + 1] })),
    { type: 'Z' as const },
  ])
  const spline = pathDefinitionToSpline({ commands, closed: true }, 'evenodd')
  drawSplineLayer(ctx, { ...layer, spline, style: { ...layer.style, fill: undefined } }, overrides)
}
