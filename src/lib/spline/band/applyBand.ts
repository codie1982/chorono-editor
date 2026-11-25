import type { SplinePathData } from '../../types/spline'
import { Matrix2D } from '../../geometry/Matrix2D'
import { outlineToSpline } from '../outline/outlineToSpline'
import { mergeSplineData } from '../factory/mergeSplineData'
import { deleteSplineEdges } from '../topology/edges'
import type { BandChain, SplineBandResult } from './types'

/** Materialize a band into ordinary editable Objects. Keep source appends to
 * the SAME spline; replace removes precisely selected edges, keeping all other
 * IDs/paint and splitting remaining open runs through canonical topology code.
 * Band fill follows source stroke until independently changed in Properties.
 * No TRS/origin changes and no modifier records are created by this helper. */
export function applySplineBand(data: SplinePathData, chains: readonly BandChain[], result: SplineBandResult, keepSource: boolean) {
  const incoming = outlineToSpline(result, Matrix2D.identity(), data.fillRule)
  for (const object of Object.values(incoming.subShapes)) object.paint = { version: 1, source: 'stroke' }
  const base = keepSource ? data : deleteSplineEdges(data, chains.flatMap(c => c.edgeIds))
  return { data: mergeSplineData(base, incoming), ids: Object.keys(incoming.subShapes) }
}
