import type {BandChain} from '../band/types'
import {deleteSplineEdges} from '../topology/edges'
import type { SplinePathData } from '../../types/spline'
import { appendSplineObjects } from '../creation'
import { removeSplineContours } from '../topology'

/** Replace explicit contour groups with freshly computed contours, retaining
 * the original Object IDs, names and unselected siblings/holes. Solver order is
 * input-group order, with two result Objects per input only for open Both.
 * Source records are borrowed; no source, paint, transform or history mutation.
 * New contour/point/edge IDs come from the canonical append/remap operation. */
export function replaceOffsetContours(source: SplinePathData, incoming: SplinePathData,
  groups: readonly { object: SplinePathData['subShapes'][string]; indices: readonly number[] }[], both: boolean) {
  const removed = new Set(groups.flatMap(group => group.indices.map(index => group.object.contourIds[index])))
  const result = appendSplineObjects(removeSplineContours(source, removed), incoming)
  const count = both ? 2 : 1
  if (result.objectIds.length !== groups.length * count) throw new Error('Offset result does not match its selected Objects.')
  const subShapes = { ...result.data.subShapes }, ids: string[] = []
  groups.forEach(({ object, indices }, index) => {
    const generated = result.objectIds.slice(index * count, (index + 1) * count)
    const contours = generated.flatMap(id => subShapes[id].contourIds)
    generated.forEach(id => { delete subShapes[id] })
    const selected = new Set(indices), first = Math.min(...indices)
    subShapes[object.id] = { ...object, source: 'edited', editable: true,
      contourIds: object.contourIds.flatMap((id, i) => i === first ? contours : selected.has(i) ? [] : [id]) }
    ids.push(object.id)
  })
  return { data: { ...result.data, subShapes }, objectIds: ids }
}

/** Replace only selected edge runs. Retain the owning Object, its paint and
 * sibling contours. Unselected runs keep their original Bézier records. */
export function replaceOffsetChains(
  source: SplinePathData,
  incoming: SplinePathData,
  chains: readonly BandChain[],
  both: boolean,
) {
  const base = deleteSplineEdges(
    source,
    chains.flatMap((chain) => chain.edgeIds),
  )
  const result = appendSplineObjects(base, incoming),
    count = both ? 2 : 1
  if (result.objectIds.length !== chains.length * count)
    throw new Error('Offset result does not match the selected edge chains.')
  const subShapes = { ...result.data.subShapes }
  chains.forEach((chain, i) => {
    const owner = subShapes[chain.objectId] ?? { ...source.subShapes[chain.objectId], contourIds: [] }
    const generated = result.objectIds.slice(i * count, (i + 1) * count)
    const contourIds = generated.flatMap((id) => subShapes[id].contourIds)
    for (const id of generated) delete subShapes[id]
    subShapes[chain.objectId] = {
      ...owner,
      source: 'edited',
      editable: true,
      contourIds: [...owner.contourIds, ...contourIds],
    }
  })
  return { data: { ...result.data, subShapes }, objectIds: Array.from(new Set(chains.map((c) => c.objectId))) }
}
