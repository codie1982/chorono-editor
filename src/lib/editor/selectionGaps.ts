import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
import type { ChronoScene } from '../types'
import { type OverrideMap } from '../evaluator'
import { createLayerWorldBoundsResolver, type LayerWorldBoundsResolver } from '../geometry/resolveLayerWorldBounds'
import { selectionNeighbors, type SelectionNeighborItem } from '../geometry/layout/selectionNeighbors'
import type { PathBounds } from '../geometry/computePathBounds'
import { createLayerWorldMatrixResolver } from '../geometry/resolveLayerWorldMatrix'
import { LayerIndex } from '../scene/LayerIndex'
import { resolveSelectionRoots } from '../selection/selectionRoots'
import { prepareTransformTargets, translateTransformTargets } from '../canvas/math/preparedTransforms'
import { sourceTransformChange } from '../canvas/math/sourceTransformChange'
import type { ViewportLayerChange } from './viewportKeyframes'

export interface SelectionGap {
  readonly id: string
  readonly axis: 'x' | 'y'
  readonly beforeId: string
  readonly afterId: string
  readonly boundsBefore: Readonly<PathBounds>
  readonly boundsAfter: Readonly<PathBounds>
  /** Signed composition-pixel separation; negative means geometry AABB overlap. */
  readonly gap: number
  readonly from: Readonly<{ x: number; y: number }>
  readonly to: Readonly<{ x: number; y: number }>
  readonly fixedId: string
  readonly movingId: string
}

export interface SelectionGapPlan {
  readonly rootIds: readonly string[]
  readonly gaps: readonly SelectionGap[]
  readonly diagnostics: readonly string[]
  readonly truncated: boolean
  /** Fail before applying a result prepared against an obsolete scene snapshot. */
  assertCurrent(scene: ChronoScene): void
  /** Compute source patches only. Caller owns timeline key policy, commands,
   * transaction eligibility and undo. Desired gap may be negative for overlap. */
  edit(gapId: string, desiredSignedGap: number): ViewportLayerChange[]
}

export interface SelectionGapOptions {
  /** Optional existing viewport resolver for this exact scene/time/overrides.
   * Borrowed for preparation only; no native resource or cache is retained. */
  boundsFor?: LayerWorldBoundsResolver
}

export const SELECTION_GAP_LIMITS = Object.freeze({ roots: 256, pairs: 128 })

/** Prepare editable nearest-neighbor measurements from one immutable evaluated
 * frame. Parent+child selections normalize through the same root policy as
 * viewport transforms. Geometry bounds include parent transforms/instances and
 * exclude stroke/effect padding; unsupported/hidden geometry is diagnosed.
 * Time uses composition milliseconds, all gaps/endpoints composition pixels.
 *
 * Active containing root stays fixed when it belongs to a pair; otherwise the
 * left/top root stays fixed. Only its paired neighbor moves, never an implicit
 * chain or soft selection. Edits reuse inverse-parent translation and canonical
 * source channel intent, preserving unrelated fallback values and key records.
 * Locked/frozen/driven/singular edited roots diagnose before any patch.
 *
 * Over 256 normalized roots yields no partial/misleading neighbor solution;
 * up to 128 exact pairs are exposed with truncation diagnostic. No scene/history
 * writes, ID generation, timers, buffers or native handles are owned. Discard on
 * source/time/override/selection changes; assertCurrent checks scene identity.
 */
export function prepareSelectionGaps(scene: ChronoScene, ids: Iterable<string>, timeMs: number,
  overrides?: OverrideMap, primaryId?: string | null, options: SelectionGapOptions = {}): SelectionGapPlan {
  if (!Number.isFinite(timeMs) || timeMs < 0) throw new RangeError('Measurement time must be finite non-negative milliseconds.')
  const index = new LayerIndex(scene.layers), selection = resolveSelectionRoots(scene.layers, ids, index)
  if (!selection.ok) throw new Error(selection.reason)
  const rootIds = selection.roots.map(layer => layer.id), diagnostics: string[] = []
  const activeRoot = selection.roots.find(root => root.id === primaryId
    || (!!primaryId && selection.ancestors.get(primaryId)?.some(parent => parent.id === root.id)))
  let gaps: SelectionGap[] = [], truncated = false
  if (rootIds.length > SELECTION_GAP_LIMITS.roots) {
    diagnostics.push(`Select at most ${SELECTION_GAP_LIMITS.roots} independent roots to measure exact neighbors.`)
    truncated = true
  } else if (rootIds.length > 1) {
    const frame = overrides ?? evaluateSceneFrame(scene, timeMs).overrides
    const boundsFor = options.boundsFor ?? createLayerWorldBoundsResolver(scene, timeMs, frame)
    const worldFor = createLayerWorldMatrixResolver(scene, timeMs, frame, index)
    const items: SelectionNeighborItem[] = []
    for (const layer of selection.roots) {
      const bounds = worldFor(layer).toArray().every(Number.isFinite) ? boundsFor(layer) : null
      if (!bounds || !Object.values(bounds).every(Number.isFinite) || bounds.width < 0 || bounds.height < 0
          || !Number.isFinite(bounds.x + bounds.width) || !Number.isFinite(bounds.y + bounds.height)) {
        diagnostics.push(`'${layer.name}' has no measurable finite geometry in this frame.`); continue
      }
      items.push({ id: layer.id, bounds: Object.freeze({ ...bounds }) })
    }
    const neighbors = selectionNeighbors(items)
    truncated = neighbors.length > SELECTION_GAP_LIMITS.pairs
    if (truncated) diagnostics.push(`Showing ${SELECTION_GAP_LIMITS.pairs} of ${neighbors.length} exact neighbor measurements.`)
    gaps = neighbors.slice(0, SELECTION_GAP_LIMITS.pairs).map(pair => {
      const fixedId = activeRoot && [pair.before.id, pair.after.id].includes(activeRoot.id) ? activeRoot.id : pair.before.id
      return { id: JSON.stringify([pair.axis, pair.before.id, pair.after.id]), axis: pair.axis,
        beforeId: pair.before.id, afterId: pair.after.id, boundsBefore: pair.before.bounds, boundsAfter: pair.after.bounds,
        gap: pair.gap, from: pair.from, to: pair.to, fixedId,
        movingId: fixedId === pair.before.id ? pair.after.id : pair.before.id }
    })
  }
  return { rootIds, gaps, diagnostics, truncated,
    assertCurrent(current) { if (current !== scene) throw new Error('The measured scene changed. Choose the current measurement again.') },
    edit(gapId, desiredSignedGap) {
      if (!Number.isFinite(desiredSignedGap)) throw new RangeError('Gap must be a finite number of composition pixels.')
      const gap = gaps.find(item => item.id === gapId)
      if (!gap) throw new Error('This neighbor measurement no longer exists.')
      const extent = gap.axis === 'x' ? 'width' : 'height'
      if (desiredSignedGap < -(gap.boundsBefore[extent] + gap.boundsAfter[extent]) / 2 - 1e-7) {
        throw new RangeError('This overlap would reverse the measured object order. Move the object directly first.')
      }
      const distance = (desiredSignedGap - gap.gap) * (gap.movingId === gap.afterId ? 1 : -1)
      if (!Number.isFinite(distance)) throw new RangeError('Gap movement would overflow.')
      if (Math.abs(distance) <= 1e-8) return []
      const prepared = prepareTransformTargets(scene, [gap.movingId], timeMs, overrides)
      if (!prepared.ok) throw new Error(prepared.reason)
      const result = translateTransformTargets(prepared.targets, gap.axis === 'x' ? { x: distance, y: 0 } : { x: 0, y: distance })
      if (!result.ok) throw new Error(result.reason)
      return result.changes.flatMap(change => {
        const patch = sourceTransformChange(prepared.targets.find(target => target.id === change.id)!, change.transform)
        return patch ? [patch] : []
      })
    } }
}
