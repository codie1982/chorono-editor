import type { SplinePathData } from '../../types/spline'
import { createSplineIdAllocator } from '../util/uid'

const families = ['subShapes', 'contours', 'points', 'handles', 'segments'] as const
export type SplineIdMaps = Record<typeof families[number], Record<string, string>>
/** Remap normalized IDs and every connectivity reference. Collision mode keeps
 * incoming IDs absent from the destination; copy mode creates all fresh IDs.
 * The returned maps describe identity changes for callers, never source metadata.
 * Inputs are immutable and positions/style are not converted here. Allocation
 * reserves all incoming/destination IDs, including imported counter-like IDs. */
export function remapSplineData(data: SplinePathData, reserved?: SplinePathData, all = false) {
  const allocate = createSplineIdAllocator(families.flatMap(family => [...Object.keys(data[family]), ...Object.keys(reserved?.[family] ?? {})]))
  const maps = Object.fromEntries(families.map(family => [family, Object.fromEntries(Object.keys(data[family]).map(id => {
    if (!all && !reserved?.[family][id]) return [id, id]
    return [id, allocate(family)]
  }))])) as SplineIdMaps
  return { data: remapSplineRecords(data, maps), maps }
}

/** Apply caller-supplied identity maps using the canonical connectivity walker.
 * Missing map entries retain IDs. Inputs are borrowed; output records detached.
 * Stable modifier namespaces and ordinary copy/collision policies share this owner. */
export function remapSplineRecords(data: SplinePathData, maps: SplineIdMaps): SplinePathData {
  const ref = (family: typeof families[number], id: string) => maps[family][id] ?? id
  const result: SplinePathData = { fillRule: data.fillRule,
    points: Object.fromEntries(Object.values(data.points).map(point => { const id = ref('points', point.id); return [id, { ...point, id }] })),
    handles: Object.fromEntries(Object.values(data.handles).map(handle => { const id = ref('handles', handle.id); return [id, { ...handle, id, pointId: ref('points', handle.pointId) }] })),
    segments: Object.fromEntries(Object.values(data.segments).map(segment => { const id = ref('segments', segment.id); return [id, { ...segment, id, fromPointId: ref('points', segment.fromPointId), toPointId: ref('points', segment.toPointId) }] })),
    contours: Object.fromEntries(Object.values(data.contours).map(contour => { const id = ref('contours', contour.id); return [id, { ...contour, id, pointIds: contour.pointIds.map(id => ref('points', id)), segmentIds: contour.segmentIds.map(id => ref('segments', id)) }] })),
    subShapes: Object.fromEntries(Object.values(data.subShapes).map(object => { const id = ref('subShapes', object.id); return [id, { ...object, id, contourIds: object.contourIds.map(id => ref('contours', id)) }] })),
  }
  return result
}
