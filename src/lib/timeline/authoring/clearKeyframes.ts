import type { ChronoScene } from '../../types'
import { makeBulkDeleteKfCmd, type EditorCommand } from '../../editor/commands-keyframe'
import { LayerIndex } from '../../scene/LayerIndex'
import { LayerTrackIndex } from '../LayerTrackIndex'
import { parseTrackTarget } from '../TrackTargetParser'

export type ClearKeyScope = { kind: 'layer'; layerId: string } | { kind: 'track'; target: string }
export interface ClearKeyPlan {
  command: EditorCommand | null
  keyIds: ReadonlySet<string>
  reason?: string
}

/** Prepare an atomic key-only deletion in one explicit timeline. Layer scope
 * covers that layer's channels, never descendants or similarly named IDs.
 * Track scope covers exactly one channel. Reuses the bulk-delete command so
 * empty tracks, controllers, modifiers, membership and static source survive.
 * Locked/frozen ancestors block the whole operation. Missing/empty targets
 * produce no command/history entry. A stale plan refuses; undo/redo restore
 * full key identities, easing, tangents and signal payloads in one step.
 */
export function prepareClearKeyframes(scene: ChronoScene, timelineId: string, scope: ClearKeyScope): ClearKeyPlan {
  const empty = (reason: string): ClearKeyPlan => ({ command: null, keyIds: new Set(), reason })
  const timeline = scene.timelines.find(item => item.id === timelineId)
  if (!timeline) return empty('Choose an active timeline first.')
  const parsed = scope.kind === 'track' ? parseTrackTarget(scope.target) : null
  const layerId = scope.kind === 'layer' ? scope.layerId : parsed?.entityType === 'layer' ? parsed.entityId : undefined
  const index = new LayerIndex(scene.layers)
  if (!layerId || !index.get(layerId)) return empty('Layer no longer exists.')
  const protectedLayer = Array.from(index.ancestorIds([layerId])).map(id => index.get(id)!).find(layer => layer.locked || layer.frozen)
  if (protectedLayer) return empty(`Unlock and unfreeze ${protectedLayer.name} first.`)
  const tracks = scope.kind === 'layer' ? new LayerTrackIndex(timeline.tracks).forLayer(layerId) : timeline.tracks.filter(track => track.target === scope.target)
  const items = tracks.flatMap(track => track.keyframes.map(kf => ({ timelineId, target: track.target, kf })))
  if (!items.length) return empty('No keyframes to clear.')
  const command = makeBulkDeleteKfCmd(items)
  return { keyIds: new Set(items.map(item => item.kf.id)), command: { ...command, label: `Clear ${items.length} Keyframes`,
    execute(current) {
      if (current.layers !== scene.layers || current.timelines !== scene.timelines) throw new Error('Source changed. Open the keyframe menu again.')
      return command.execute(current)
    } } }
}
