import type { Layer } from '../../types'
export const LIVE_OUTLINE_TYPE = 'liveOutline'
/** Read portable live-owner metadata without importing runtime registry/render
 * code. Geometry evaluation and source-edit admission remain stack-owned. */
export function liveOutlineRecord(layer?: Layer | null) { return layer?.modifierStack?.modifiers.find(record => record.type === LIVE_OUTLINE_TYPE) }
/** Explicit Object scope follows surviving Object IDs across Refine/Delete.
 * Empty scope means all current Objects; deleted IDs never expand the scope. */
export function liveOutlineObjectIds(layer: Layer): string[] {
  const record = liveOutlineRecord(layer), ids = record?.settings.objectIds
  if (!record || !layer.spline || !Array.isArray(ids)) return []
  return ids.length ? ids.filter((id): id is string => typeof id === 'string' && !!layer.spline!.subShapes[id]) : Object.keys(layer.spline.subShapes)
}
