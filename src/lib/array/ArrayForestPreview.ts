import type { ChronoScene, Layer } from '../types'
import type { Matrix2D } from '../geometry/Matrix2D'
import { evaluateTimelines } from '../evaluator'
import { createLayerWorldBoundsResolver } from '../geometry/resolveLayerWorldBounds'
import { offsetCloneRange, offsetCloneTrack } from '../clone/CloneForestTiming'
import type { ArrayForestPreview } from './ArrayForestTypes'
import { parseTrackTarget } from '../timeline/TrackTargetParser'

/** Prepare a source-target frame without allocating clone layers/IDs. For time
 * offsets, shifted key records drive the same evaluator used after Apply;
 * unselected parent tracks retain their original clocks. A plain no-animation
 * copy uses source fallbacks, matching V4 rather than stamping the displayed pose.
 */
export function arrayPreviewScene(base: ChronoScene, ids: ReadonlySet<string>, deltaMs: number,
  duplicateAnimation: boolean): ChronoScene {
  if (!deltaMs && duplicateAnimation) return base
  return { ...base, layers: deltaMs ? base.layers.map(layer => ids.has(layer.id)
    ? offsetCloneRange(layer, deltaMs, base.composition.durationMs) : layer) : base.layers,
  timelines: base.timelines.map(timeline => ({ ...timeline, tracks: timeline.tracks.flatMap(track => {
    const target = parseTrackTarget(track.target), selected = target?.entityType === 'layer' && ids.has(target.entityId)
    if (!selected) return [track]
    return duplicateAnimation ? [offsetCloneTrack(track, deltaMs, timeline.durationMs)] : []
  }) })) }
}

/** Bounded composition-space root bounding outlines. The preview transforms
 * bounds from the exact sampled copy frame. It is an editing wireframe, not a
 * raster/effect-quality renderer. At most128 occurrences,2048 root outlines and
 * 200k shifted source keys are visited; remaining records are explicitly omitted.
 */
export function buildArrayForestPreview(base: ChronoScene, roots: readonly Layer[], ids: ReadonlySet<string>,
  occurrences: readonly { index: number; world: Matrix2D; placement: { timeOffsetMs?: number } }[],
  timeMs: number, duplicateAnimation: boolean, sourceKeys: number): ArrayForestPreview {
  const maxOccurrences = Math.max(1, Math.min(128, Math.floor(2048 / roots.length),
    sourceKeys ? Math.floor(200000 / sourceKeys) : 128))
  const outlines: ArrayForestPreview['outlines'][number][] = []
  let lastDelta: number | undefined, lastScene: ChronoScene | undefined
  let lastBounds: ReturnType<typeof createLayerWorldBoundsResolver> | undefined
  for (const occurrence of occurrences.slice(0, maxOccurrences)) {
    const delta = occurrence.placement.timeOffsetMs ?? 0
    if (delta !== lastDelta) {
      lastDelta = delta; lastScene = arrayPreviewScene(base, ids, delta, duplicateAnimation)
      lastBounds = createLayerWorldBoundsResolver(lastScene, timeMs, evaluateTimelines(lastScene.timelines, timeMs))
    }
    const scene = lastScene!, bounds = lastBounds!
    for (const root of roots) {
      const current = scene.layers.find(layer => layer.id === root.id)!, value = bounds(current)
      if (!value) continue
      const corners = [{ x: value.x, y: value.y }, { x: value.x + value.width, y: value.y },
        { x: value.x + value.width, y: value.y + value.height }, { x: value.x, y: value.y + value.height }]
      outlines.push({ rootId: root.id, occurrenceIndex: occurrence.index, points: corners.map(point => occurrence.world.applyToPoint(point)) })
    }
  }
  return { outlines, truncated: occurrences.length > maxOccurrences }
}
