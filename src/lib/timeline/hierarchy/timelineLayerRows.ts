import type { Layer, Timeline, Track } from '../../types'
import { LayerTrackIndex } from '../LayerTrackIndex'
import { editorSoloScope } from '../../scene/visibility/editorSoloScope'
import { buildEditorLayerRows, selectedBranchIds, type EditorLayerRow } from '../../scene/hierarchy/editorLayerRows'

export interface TimelineLayerRow extends EditorLayerRow {
  readonly tracks: readonly Track[]
  readonly timelineEligible: boolean
  readonly showTracks: boolean
}
export interface TimelineLayerRowsOptions {
  readonly collapsedIds?: ReadonlySet<string>
  readonly filter?: string
  readonly selectedOnly?: boolean
  readonly selectedId?: string | null
  readonly selectedIds?: ReadonlySet<string>
  readonly animatedOnly?: boolean
  readonly revealIds?: readonly string[]
  readonly trackIndex?: LayerTrackIndex
}

/** Timeline adapter of the common editor hierarchy. Timeline membership and
 * routed/global audio remain eligibility constraints; hidden/inactive objects
 * stay editable. Solo, text/property search and selected-branch union select
 * matches; ancestors remain structural rows. Find can display an excluded path
 * but never authors membership or permits editing foreign audio in this timeline.
 * Own property rows are exposed for matches or explicitly found eligible layers,
 * not unrelated context ancestors. Borrows source, returns caller-owned rows.
 */
export function buildTimelineLayerRows(layers: readonly Layer[], timeline: Timeline | null, options: TimelineLayerRowsOptions = {}) {
  const tracks = options.trackIndex ?? new LayerTrackIndex(timeline?.tracks ?? [])
  const membership = timeline?.layerIds === undefined ? null : new Set(timeline.layerIds)
  const eligible = new Set(layers.filter(layer =>
    (layer.type !== 'audio' || !layer.audio?.timelineId || layer.audio.timelineId === timeline?.id) &&
    (!membership || membership.has(layer.id) || layer.type === 'audio' && !layer.audio?.timelineId)).map(layer => layer.id))
  const solo = editorSoloScope(layers), query = (options.filter ?? '').trim().toLowerCase()
  const selected = options.selectedOnly ? selectedBranchIds(layers, options.selectedId ?? null, options.selectedIds) : null
  const matches = new Set(layers.filter(layer => eligible.has(layer.id) && (!solo || solo.has(layer.id)) &&
    (!selected || selected.has(layer.id)) &&
    (!options.animatedOnly || tracks.forLayer(layer.id).some(track => track.keyframes.length > 0)) &&
    (!query || layer.name.toLowerCase().includes(query) || layer.type.toLowerCase().includes(query) || tracks.forLayer(layer.id).some(track => track.target.toLowerCase().includes(query))))
    .map(layer => layer.id))
  const revealed = new Set(options.revealIds)
  const rows: TimelineLayerRow[] = buildEditorLayerRows(layers, { matches, collapsedIds: options.collapsedIds, revealIds: options.revealIds }).map(row => {
    const timelineEligible = eligible.has(row.layer.id)
    const showTracks = timelineEligible && (matches.has(row.layer.id) || revealed.has(row.layer.id))
    return { ...row, timelineEligible, showTracks, tracks: showTracks ? tracks.forLayer(row.layer.id) : [] }
  })
  return { rows, matches, eligible }
}
