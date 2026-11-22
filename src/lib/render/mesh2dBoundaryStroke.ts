import type { Layer } from '../types'
import type { OverrideMap } from '../evaluator'
import { pathDefinitionToSpline } from '../geometry/conversion/ShapeToSplineConverter'
import { drawSplineLayer } from '../renderer'
import { mesh2DBoundaryPath } from '../geometry/mesh2d'

/** Stroke only true mesh boundaries, including holes, through the canonical
 * spline paint/trim implementation. Rings use topology indices so deformation
 * follows the current borrowed positions. Internal triangulation edges never
 * paint. No source mutation, topology recomputation, assets or caches owned. */
export function drawMesh2DBoundaryStroke(ctx: CanvasRenderingContext2D, layer: Layer,
  overrides: OverrideMap, positions: ArrayLike<number>): void {
  if (!layer.style?.stroke || !layer.mesh2d?.boundaryRings?.length) return
  const spline = pathDefinitionToSpline(mesh2DBoundaryPath(layer.mesh2d.boundaryRings, positions), 'evenodd')
  drawSplineLayer(ctx, { ...layer, spline, style: { ...layer.style, fill: undefined } }, overrides)
}
