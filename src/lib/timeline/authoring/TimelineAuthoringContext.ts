import type { Layer } from '../../types'
import { layerRegistry } from '../../registry'
import type { LayerLookup } from '../../scene/LayerIndex'

/** Ephemeral authoring authority supplied by an editor host, never by scene JSON
 * or an animation parameter. Scene context retains legacy outer-2D behavior.
 * Content context addresses exactly one owner and one draft Timeline in local
 * milliseconds. It grants neither parent/other-owner edits nor playback/commit
 * authority. Detail hosts must still enforce their document/revision boundary.
 * This record is not a persisted clip, an instance clock or a workspace mode.
 */
export type TimelineAuthoringContext =
  | { readonly kind: 'scene' }
  | { readonly kind: 'content'; readonly ownerLayerId: string; readonly timelineId: string }

/** Minimal borrowed source required for validating ownership; projection and
 * command consumers need not provide composition, render handles or runtime.
 */
export interface TimelineContextSource {
  readonly layers: readonly Layer[]
  readonly timelines: readonly { readonly id: string }[]
}

/** Default for all existing UI, MCP and scripting entry points. Omitted context
 * never means permission to edit internal fields. Safe to share across hosts.
 */
export const SCENE_TIMELINE_CONTEXT: TimelineAuthoringContext = Object.freeze({ kind: 'scene' })

/** Create a validated, immutable context for an isolated draft host. The draft
 * must already contain the owner and Timeline; this function creates neither
 * and never converts/reparents source. A static editor without declared content
 * channels fails explicitly. This context is not exposed as MCP/script input.
 */
export function contentTimelineContext(scene: TimelineContextSource, ownerLayerId: string, timelineId: string): TimelineAuthoringContext {
  const context: TimelineAuthoringContext = Object.freeze({ kind: 'content', ownerLayerId, timelineId })
  assertTimelineContext(scene, timelineId, context)
  return context
}

/** Whether this existing owner declares at least one feature-owned content
 * channel. Locked/frozen edit policy remains with the normal command owner.
 */
export function hasContentTimeline(layer: Layer): boolean {
  return !!layerRegistry.findForLayer(layer)?.contentTimelinePaths?.length
}

/** Validate ephemeral scope against the current draft before any edit. Content
 * callers fail closed for missing/replaced owner type, missing Timeline or a
 * cross-Timeline operation. Scene callers retain existing missing-target/no-op
 * semantics; serializers, evaluators and Undo restoration never use this guard.
 * An optional lookup must represent these exact layers; batches reuse their
 * current-source index rather than searching all layers for each key.
 */
export function assertTimelineContext(scene: TimelineContextSource, timelineId: string, context: TimelineAuthoringContext, lookup?: LayerLookup): void {
  if (context.kind === 'scene') return
  if (context.kind !== 'content' || !context.ownerLayerId || !context.timelineId || context.timelineId !== timelineId) {
    throw new Error('The content Timeline context does not own this Timeline.')
  }
  const owner = lookup ? lookup.get(context.ownerLayerId) : scene.layers.find(layer => layer.id === context.ownerLayerId)
  if (!owner || !hasContentTimeline(owner)) throw new Error('The content Timeline owner is missing or does not support internal key targets.')
  if (!scene.timelines.some(timeline => timeline.id === timelineId)) throw new Error('The content Timeline no longer exists.')
}
