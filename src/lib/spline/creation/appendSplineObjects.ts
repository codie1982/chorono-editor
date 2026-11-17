import type { SplinePathData } from '../../types/spline'
import { mergeSplineData } from '../factory/mergeSplineData'

/** Append fresh normalized geometry without replacing any existing record.
 * Generators allocate unique IDs; imported/colliding records are rejected, not
 * silently overwritten. Names get a readable numeric suffix. Layer style,
 * transforms, tracks, old IDs and ownership remain the caller's responsibility.
 * Returns the merged source and new Object IDs for transient post-commit focus. */
export function appendSplineObjects(base: SplinePathData, incoming: SplinePathData) {
  for (const family of ['points', 'handles', 'segments', 'contours', 'subShapes'] as const)
    for (const id of Object.keys(incoming[family])) if (base[family][id]) throw new Error('Spline IDs overlap. Generate fresh geometry before appending.')
  const names = new Set(Object.values(base.subShapes).map(object => object.name))
  const subShapes = { ...incoming.subShapes }
  for (const object of Object.values(subShapes)) {
    const stem = object.name || object.kind
    let name = stem, suffix = 2
    while (names.has(name)) name = `${stem} ${suffix++}`
    names.add(name); subShapes[object.id] = { ...object, name }
  }
  return { data: mergeSplineData(base, { ...incoming, subShapes }), objectIds: Object.keys(subShapes) }
}
