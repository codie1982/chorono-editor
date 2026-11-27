import type { ChronoScene } from '../../../types'
import type { SplineEditMode } from '../../../spline/selection'
import { editableSplineLayer } from '../../../spline/edit/authoringGuard'
import { liveOutlineSelection } from '../../../spline/liveOutline/selection'
import { liveOutlineRecord, LIVE_OUTLINE_TYPE } from '../../../spline/liveOutline/data'
import { readBandDraft } from '../../../spline/band/settingsFields'
import type { SplineBandRequest, SplineBandResult } from '../../../spline/band/types'
import { makeExecuteModifierStackCmd, prepareAddModifier } from '../../modifiers/commands'

/** Capture the original line for a source-only worker preview. Apply persists
 * one live recipe, not the worker's generated points. Stable Object scope tracks
 * future source Refine/point edits; existing source IDs and layer TRS stay exact.
 * Native modifier commands own CAS/Undo/driver admission and ordered evaluation. */
export function prepareLiveSplineOutline(scene: ChronoScene, layerId: string, mode: SplineEditMode, ids: readonly string[], draft: Readonly<Record<string, unknown>>) {
  const layer = editableSplineLayer(scene, layerId), selection = liveOutlineSelection(layer.spline, mode, ids)
  const request: SplineBandRequest = { data: layer.spline, chains: selection.chains, settings: readBandDraft(draft) }
  return { request, command(_preview: SplineBandResult) {
    const existing = liveOutlineRecord(layer)
    // Settings are layer-wide; adding another target retains earlier targets.
    const previous = existing?.settings.objectIds
    const objectIds = existing && Array.isArray(previous) && !previous.length ? []
      : Array.from(new Set([...(Array.isArray(previous) ? previous.filter((id): id is string => typeof id === 'string' && !!layer.spline.subShapes[id]) : []), ...selection.objectIds]))
    const settings = { ...draft, objectIds }
    if (existing) return { ids: selection.objectIds, command: makeExecuteModifierStackCmd(scene, layerId, { [existing.id]: settings }, { enableIds: [existing.id] }) }
    const added = prepareAddModifier(scene, layerId, LIVE_OUTLINE_TYPE, undefined, settings)
    if (added.warning) throw new Error(added.warning)
    return { ids: selection.objectIds, command: added.command }
  } }
}
