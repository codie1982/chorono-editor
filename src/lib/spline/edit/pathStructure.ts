import type { SplinePathData } from '../../types/spline'
import { separateSplineElements } from '../../geometry/conversion/GeometryConversionService'
import { subShapeData } from '../../spline/selection'
import { mergeSplineData } from '../../spline/factory/mergeSplineData'
import { removeSplineContours } from '../../spline/topology'
import { uid } from '../../spline/util/uid'

/** Compound regroups selected contours with even-odd holes, without solving or
 * flattening Béziers. Separate reuses the conversion domain's nesting classifier
 * to create independent outer elements while retaining their holes and original
 * C/Q records. Selection outside the scope is untouched. All coordinates are
 * layer-local; tolerance .25 px is classification-only. No mutation; callers own one native source command/Undo.
 * Intersecting/ambiguous contours refuse Separate instead of inventing holes. */
export function restructureSplinePaths(data: SplinePathData, selected: readonly string[], kind: 'compound' | 'separate') {
  const ids = selected.length ? Array.from(new Set(selected)) : Object.keys(data.subShapes)
  if (!ids.length || ids.some(id => !data.subShapes[id])) throw new Error('Select current spline Objects.')
  let resultIds: string[] = []
  const source = data
  const next: SplinePathData = ((): SplinePathData => {
    if (kind === 'compound') {
      const id = uid('compound'), picked = new Set(ids)
      resultIds = [id]
      return { ...source, fillRule: 'evenodd', subShapes: {
        ...Object.fromEntries(Object.entries(source.subShapes).filter(([id]) => !picked.has(id))),
        [id]: { id, name: 'Compound Path', kind: 'custom', source: 'edited', editable: true, combineMode: 'none',
          contourIds: ids.flatMap(id => source.subShapes[id].contourIds) },
      } }
    }
    const selectedData = ids.map(id => subShapeData(source, id)).reduce(mergeSplineData)
    const separated = separateSplineElements(selectedData, .25)
    const subShapes = Object.fromEntries(Object.values(separated.subShapes).map(object => {
      const id = uid('path'); resultIds.push(id); return [id, { ...object, id }]
    }))
    const contours = new Set(ids.flatMap(id => source.subShapes[id].contourIds))
    return mergeSplineData(removeSplineContours(source, contours), { ...separated, subShapes })
  })()
  return { data: next, ids: resultIds }
}
