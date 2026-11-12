import type { ChronoScene } from '../types'
import { resolveCloneForest, cloneForestSourceGuard } from '../clone/CloneForestSource'
import { assertCloneForestBudget, CLONE_WORKLOAD_LIMITS } from '../clone/CloneWorkload'
import { offsetCloneRange, offsetCloneTrack } from '../clone/CloneForestTiming'
import { prepareCloneForest } from './commands-clone-forest'
import { parseTrackTarget } from '../timeline/TrackTargetParser'
import { assertCloneModeCapability } from '../clone/CloneCapabilities'
import { LayerIndex } from '../scene/LayerIndex'
import { countArrayInstances } from '../array/ArrayTransformResolver'
import { solveArrayForest } from '../array/ArrayForestMath'
import { buildArrayForestPreview } from '../array/ArrayForestPreview'
import type { ArrayForestOptions, ArrayForestPlan } from '../array/ArrayForestTypes'
import type { CloneForestCommand } from '../clone/CloneForestTypes'
export type { ArrayForestOptions, ArrayForestPlan, ArrayForestSummary, ArrayForestPreview } from '../array/ArrayForestTypes'

/** Prepare V5 selection-array math/preview once without creating scene copies.
 * Every occurrence is the same normalized forest. All relevant source timeline
 * tracks copy by default; source layers/keys never mutate. Apply lazily builds
 * one cached V4 clone command from these exact occurrence placements, preserving
 * internal refs, stable IDs, source guards and one undo. The plan borrows its
 * immutable source snapshot and must be discarded on document/time/selection edit.
 * Unsupported spaces/shear/drivers/time offsets fail before source writes.
 */
export function prepareArrayForest(base: ChronoScene, options: ArrayForestOptions): ArrayForestPlan {
  validateSettings(options)
  const settings = structuredClone(options.settings), owned = { ...options, settings }
  const { roots, layers } = resolveCloneForest(base, { sourceIds: options.sourceIds, mode: settings.cloneMode })
  assertCloneModeCapability(base, layers, settings.cloneMode)
  const ids = new Set(layers.map(layer => layer.id)), total = countArrayInstances(settings)
  const newCount = total - (settings.sourcePolicy === 'include-source' ? 1 : 0)
  const timelines = new Set(base.timelines.map(timeline => timeline.id))
  const guard = cloneForestSourceGuard(base, layers, timelines)
  const index = new LayerIndex(base.layers), projectionRecords = new Map<string, typeof layers[number]>()
  const retainChain = (id: string) => {
    let layer = index.get(id)
    while (layer && !projectionRecords.has(layer.id)) {
      projectionRecords.set(layer.id, layer); layer = layer.parentId ? index.get(layer.parentId) : undefined
    }
  }
  roots.forEach(root => retainChain(root.id))
  if (settings.pattern === 'path') retainChain(settings.pathLayerId)
  const assertCurrent = (current: ChronoScene) => {
    guard(current)
    if (current.composition.durationMs !== base.composition.durationMs
        || current.composition.width !== base.composition.width || current.composition.height !== base.composition.height) {
      throw new Error('The array composition duration or dimensions changed. Prepare a new preview.')
    }
    const lookup = new LayerIndex(current.layers)
    if (Array.from(projectionRecords.values()).some(layer => lookup.get(layer.id) !== layer)) {
      throw new Error('The array source, parent or path changed. Prepare a new preview.')
    }
  }
  let sourceKeys = 0
  const sourceTracks: { durationMs: number; track: ChronoScene['timelines'][number]['tracks'][number] }[] = []
  for (const timeline of base.timelines) for (const track of timeline.tracks) {
    const parsed = parseTrackTarget(track.target)
    if (parsed?.entityType === 'layer' && ids.has(parsed.entityId)) {
      sourceKeys += track.keyframes.length; sourceTracks.push({ track, durationMs: timeline.durationMs })
    }
  }
  if (newCount) assertCloneForestBudget(base, ids, newCount, { timelineIds: settings.duplicateAnimation ? timelines : new Set() })
  const solved = solveArrayForest(base, roots, owned)
  let wrappers = 0
  for (const occurrence of solved.occurrences) {
    for (const placement of Object.values(occurrence.placement.roots)) {
      if ((placement.rotationDeg ?? 0) !== 0 || (placement.scaleX ?? 1) !== 1 || (placement.scaleY ?? 1) !== 1) wrappers++
    }
    const deltaMs = occurrence.placement.timeOffsetMs ?? 0
    for (const layer of layers) offsetCloneRange(layer, deltaMs, base.composition.durationMs)
    if (settings.duplicateAnimation) for (const source of sourceTracks) offsetCloneTrack(source.track, deltaMs, source.durationMs)
  }
  if (base.layers.length + layers.length * newCount + wrappers > CLONE_WORKLOAD_LIMITS.layers) throw new Error('Expanded array placement workload limit exceeded.')
  const preview = buildArrayForestPreview(base, roots, ids, solved.occurrences, options.timeMs, settings.duplicateAnimation, sourceKeys)
  const diagnostics = ['Array operations use the selected coordinate frame at the pinned authoring time; copies keep their existing parent-space animation.']
  if (preview.truncated) diagnostics.push('Preview is bounded and shows a subset; Apply uses every admitted occurrence.')
  if (!settings.duplicateAnimation) diagnostics.push('Without animation, copies use authored source fallback values rather than a baked current pose.')
  let command: CloneForestCommand | undefined
  return { sourceRootIds: roots.map(root => root.id), reference: solved.reference,
    summary: { sourceRoots: roots.length, sourceLayers: layers.length, totalOccurrences: total,
      newOccurrences: newCount, newLayers: layers.length * newCount + wrappers, newKeys: settings.duplicateAnimation ? sourceKeys * newCount : 0 },
    preview, diagnostics, assertCurrent, buildCommand: () => {
      if (!newCount) throw new Error('This array creates no new occurrences.')
      if (!command) {
        const prepared = prepareCloneForest(base, { sourceIds: roots.map(root => root.id), mode: settings.cloneMode,
          duplicateAnimation: settings.duplicateAnimation, count: newCount }).atPlacements(solved.occurrences.map(occurrence => occurrence.placement))
        command = { ...prepared, execute: current => { assertCurrent(current); return prepared.execute(current) } }
      }
      return command
    } }
}

/** Validate runtime inputs before solvers allocate arrays. Runtime/API consumers
 * can bypass TypeScript; no console-warning fallback interprets an unknown space.
 * Existing legacy solver contracts remain unchanged for older single-root callers. */
function validateSettings(options: ArrayForestOptions): void {
  const settings = options.settings
  if (!Number.isFinite(options.timeMs) || options.timeMs < 0) throw new Error('Array authoring time must be finite non-negative milliseconds.')
  if (!['world', 'parent', 'local'].includes(settings.space) || !['include-source', 'clone-source-too'].includes(settings.sourcePolicy)
      || !['incremental', 'total'].includes(settings.transformMode) || !['copy', 'instance'].includes(settings.cloneMode)) throw new Error('Unsupported array coordinate, source or clone policy.')
  const integer = (value: number) => Number.isInteger(value) && value >= 1 && value <= CLONE_WORKLOAD_LIMITS.layers
  if (settings.pattern === 'grid' ? !integer(settings.rows) || !integer(settings.columns) : !integer(settings.count)) throw new Error('Array counts must be positive integers within the workload limit.')
  if (countArrayInstances(settings) > CLONE_WORKLOAD_LIMITS.layers) throw new Error('Array occurrence count exceeds the workload limit.')
  const finite = (value: unknown): boolean => typeof value === 'number' ? Number.isFinite(value)
    : !value || typeof value !== 'object' || Object.values(value).every(finite)
  if (!finite(settings)) throw new Error('Array numeric settings must be finite.')
  if (settings.pattern === 'linear' && (settings.scale.x <= 0 || settings.scale.y <= 0)) throw new Error('Array scale factors must be positive.')
  if (settings.pattern === 'radial' && settings.radius < 0) throw new Error('Array radius must be non-negative.')
  if (settings.pattern === 'path' && (settings.startOffset < 0 || settings.endOffset < 0)) throw new Error('Path array offsets must be non-negative.')
}
