import type { SplinePathData } from '../../types/spline'
export interface SplineElementIds { subShapeIds: string[]; contourIds: string[]; pointIds: string[]; handleIds: string[]; segmentIds: string[] }
const records = ['subShapes', 'contours', 'points', 'handles', 'segments'] as const
const names = ['subShapeIds', 'contourIds', 'pointIds', 'handleIds', 'segmentIds'] as const
/** Detached stable record IDs in authored record order. */
export function elementIds(data: SplinePathData): SplineElementIds {
  return { subShapeIds: Object.keys(data.subShapes), contourIds: Object.keys(data.contours), pointIds: Object.keys(data.points), handleIds: Object.keys(data.handles), segmentIds: Object.keys(data.segments) }
}
/** New records only; topology callers use these IDs instead of guessing. */
export function newElementIds(before: SplinePathData, after: SplinePathData): SplineElementIds {
  const result = elementIds(after)
  records.forEach((record, i) => { result[names[i]] = result[names[i]].filter(id => !before[record][id]) })
  return result
}
