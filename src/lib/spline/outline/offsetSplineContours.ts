import type { SplinePathData } from '../../types/spline'
import { Matrix2D } from '../../geometry/Matrix2D'
import { PlanarOutlineBackend } from './PlanarOutlineBackend'
import { outlineToSpline } from './outlineToSpline'
import { replaceOffsetContours } from './replaceOffsetContours'
import type { OutlineSettings } from './types'
import { subShapeData } from '../geometry/elementPaths'
import { splineToPathDefinition } from '../splineToPath'
import { removeSplineContours } from '../topology'
import { mergeSplineData } from '../factory/mergeSplineData'

/** Stateless source-local offset preparation over the existing planar solver.
 * Selected complete contours include sibling boundaries for hole admission.
 * Preserve mode keeps Object IDs/name/interpolation and unselected contours;
 * legacy mode retains its historical new-Object materialization. No layer,
 * scene, history, renderer or worker ownership. Output is sampled to settings'
 * local-pixel tolerance; invalid targets/degenerate geometry refuse atomically. */
export function offsetSplineContours(data: SplinePathData, ids: readonly string[], settings: OutlineSettings, preserveObjects = false): SplinePathData {
  if (!ids.length || ids.some(id => !data.contours[id])) throw new Error('Offset contour no longer exists.')
  const groups = Object.values(data.subShapes).flatMap(object => {
    const indices = object.contourIds.flatMap((id, index) => ids.includes(id) ? [index] : [])
    return indices.length ? [{ object, indices }] : []
  })
  const result = new PlanarOutlineBackend().compute({ ...settings, inputs: groups.map(({ object, indices }) => ({
    name: object.name, path: splineToPathDefinition(subShapeData(data, object.id)), fillRule: data.fillRule, indices,
  })) })
  const incoming = outlineToSpline(result, Matrix2D.identity(), data.fillRule)
  return preserveObjects ? replaceOffsetContours(data, incoming, groups, settings.side === 'both').data
    : mergeSplineData(removeSplineContours(data, new Set(ids)), incoming)
}
