import type { ChronoScene, Layer } from '../types'
import { parseTrackTarget } from '../timeline/TrackTargetParser'
import { resolveCloneForest, cloneForestSourceGuard } from '../clone/CloneForestSource'
import { prepareCloneOccurrences } from '../clone/CloneForestPreparation'
import { needsClonePlacementGroup, translateCloneTrack, clonePlacementGroup } from '../clone/CloneForestPlacement'
import { assertCloneForestBudget } from '../clone/CloneWorkload'
import { offsetCloneRange, offsetCloneTrack } from '../clone/CloneForestTiming'
import type { CloneOccurrencePlacement, CloneForestCommand, CloneForestOffsets, CloneForestOptions, PreparedCloneForest } from '../clone/CloneForestTypes'
export type { CloneOccurrencePlacement, CloneRootPlacement, CloneForestCommand, CloneForestOffsets, CloneForestOptions, PreparedCloneForest } from '../clone/CloneForestTypes'

/** Prepare independent source/subtree/animation templates once. Ordinary root
 * position keys receive the same parent-local translation as static source;
 * driven inputs are preserved behind a named placement parent. No IDs are
 * allocated by atOffsets, making source+clone drag previews and redo stable.
 * Default animation scope is all source timelines, unlike the legacy one-TL API.
 * Scene binding/wire targets reject rather than silently losing their graph.
 * atPlacements additionally accepts exact per-occurrence parent TRS and source
 * key/clip time offsets. Affine rotation/scale gets a native placement parent;
 * strict time bounds preserve complete keys rather than trimming. atOffsets
 * retains the original incremental-translation contract for existing callers.
 * Scene triggers/state machines are deliberately not cloned; parameter IDs stay
 * external/shared. Unsupported instance or translated Follow Path refs reject.
 */
export function prepareCloneForest(base: ChronoScene, options: CloneForestOptions): PreparedCloneForest {
  const count = options.count ?? 1
  const mode = options.mode ?? 'copy'
  if (!Number.isInteger(count) || count < 1) throw new Error('Clone count must be a positive integer.')
  const { roots, layers } = resolveCloneForest(base, options)
  const ids = new Set(layers.map(layer => layer.id)), rootIds = new Set(roots.map(layer => layer.id))
  const timelineIds = new Set(options.duplicateAnimation === false ? [] : options.timelineIds ?? base.timelines.map(timeline => timeline.id))
  if (Array.from(timelineIds).some(id => !base.timelines.some(timeline => timeline.id === id))) throw new Error('A requested clone timeline no longer exists.')
  const placement = new Set(roots.filter(root => needsClonePlacementGroup(base, root)).map(root => root.id))
  assertCloneForestBudget(base, ids, count, { extraLayersPerOccurrence: placement.size, timelineIds })
  const occurrences = prepareCloneOccurrences(base, layers, roots, options, timelineIds)
  const guard = cloneForestSourceGuard(base, layers, timelineIds)
  const atPlacements = (placements: readonly CloneOccurrencePlacement[]): CloneForestCommand => {
    if (placements.length !== count) throw new Error('Every clone occurrence needs exactly one placement.')
    const wrapperBudget = placements.reduce((total, item) => total + roots.filter(root => {
      const value = item.roots[root.id]
      return value && (((value.x || value.y) && placement.has(root.id)) || (value.rotationDeg ?? 0) !== 0
        || (value.scaleX ?? 1) !== 1 || (value.scaleY ?? 1) !== 1)
    }).length, 0)
    assertCloneForestBudget(base, ids, count, { extraLayersTotal: wrapperBudget, timelineIds })
    for (const item of placements) {
      const offsets = item.roots
      if (Object.keys(offsets).some(id => !rootIds.has(id))) throw new Error('Clone offsets must address selected forest roots.')
      for (const offset of Object.values(offsets)) if (![offset.x, offset.y].every(Number.isFinite)) throw new Error('Clone offsets must be finite parent-local coordinates.')
      const translated = roots.some(root => (offsets[root.id]?.x ?? 0) !== 0 || (offsets[root.id]?.y ?? 0) !== 0)
      if (translated || Object.values(offsets).some(value => (value.rotationDeg ?? 0) !== 0 || (value.scaleX ?? 1) !== 1 || (value.scaleY ?? 1) !== 1)) validateFollowPlacement(base, layers, roots)
    }
    const newLayers: Layer[] = [], additions = new Map<string, ReturnType<typeof translateCloneTrack>[]>()
    const selection: string[] = [], diagnostics: string[] = []
    const metadata = Object.assign({}, ...occurrences.map(occurrence => occurrence.metadata))
    for (let i = 0; i < occurrences.length; i++) {
      const occurrence = occurrences[i], rootOffsets: Record<string, { x: number; y: number }> = Object.create(null)
      const rootCopies = new Map(roots.map(root => [occurrence.idMap[root.id], root]))
      const item = placements[i], deltaMs = item.timeOffsetMs ?? 0
      if (!Number.isFinite(deltaMs)) throw new Error('Clone time offset must be finite.')
      for (const rawTemplate of occurrence.layers) {
        const template = offsetCloneRange(rawTemplate, deltaMs, base.composition.durationMs)
        const root = rootCopies.get(template.id)
        if (!root) { newLayers.push(template); continue }
        const offset = item.roots[root.id] ?? { x: 0, y: 0 }, x = offset.x, y = offset.y
        const rotationDeg = offset.rotationDeg ?? 0, scaleX = offset.scaleX ?? 1, scaleY = offset.scaleY ?? 1
        if (![rotationDeg, scaleX, scaleY].every(Number.isFinite) || Math.abs(scaleX * scaleY) < 1e-9) throw new Error('Clone placement must have finite nonzero scale.')
        if (![x, y].every(Number.isFinite)) throw new Error('Clone occurrence placement would overflow its transform.')
        if (((x || y) && placement.has(root.id)) || rotationDeg !== 0 || scaleX !== 1 || scaleY !== 1) {
          assertPlacementDepth(base, root, layers)
          const group = clonePlacementGroup(root, occurrence.wrapperIds[root.id], x, y)
          group.transform = { ...group.transform, rotationDeg, scaleX, scaleY }
          newLayers.push(group, { ...template, parentId: group.id }); selection.push(group.id)
          metadata[group.id] = { ...occurrence.metadata[template.id], sourceId: root.id }
          diagnostics.push(`'${root.name}' uses an explicit Placement group to preserve its source animation and geometry.`)
        } else {
          if (![template.transform.x + x, template.transform.y + y].every(Number.isFinite)) throw new Error('Clone placement would overflow its transform.')
          newLayers.push({ ...template, transform: { ...template.transform, x: template.transform.x + x, y: template.transform.y + y } })
          rootOffsets[template.id] = { x, y }; selection.push(template.id)
        }
      }
      occurrence.tracks.forEach((tracks, timelineId) => additions.set(timelineId,
        [...(additions.get(timelineId) ?? []), ...tracks.map(track => offsetCloneTrack(translateCloneTrack(track, rootOffsets), deltaMs, base.timelines.find(value => value.id === timelineId)!.durationMs))]))
    }
    const createdIds = new Set(newLayers.map(layer => layer.id)), createdTargets = new Set(Array.from(additions.values()).flat().map(track => track.target))
    const createdKeyIds = new Set(Array.from(additions.values()).flatMap(tracks => tracks.flatMap(track => track.keyframes.map(key => key.id))))
    const label = `${mode === 'instance' ? 'Instance' : 'Copy'} ${roots.length} source roots (${count} ${count === 1 ? 'occurrence' : 'occurrences'})`
    if (base.triggers.length || base.stateMachines?.length) diagnostics.push('Scene triggers and state-machine graphs stay external; this operation copies layers and their selected timeline tracks.')
    const command: CloneForestCommand = { label, diagnostics: Array.from(new Set(diagnostics)),
      idMaps: occurrences.map(occurrence => ({ ...occurrence.idMap })), sourceRootIds: roots.map(root => root.id), layerMetadata: metadata,
      result: { label, createdLayerIds: Array.from(createdIds), createdTrackTargets: Array.from(createdTargets), suggestedSelection: selection },
      execute: scene => {
        guard(scene)
        if (new Set(scene.layers.map(layer => layer.id)).size !== scene.layers.length) throw new Error('Repair duplicate layer IDs before cloning.')
        assertCloneForestBudget(scene, ids, count, { extraLayersTotal: wrapperBudget, timelineIds })
        if (scene.layers.some(layer => createdIds.has(layer.id))) throw new Error('Reserved clone IDs already exist. Prepare a fresh clone plan.')
        if (scene.timelines.some(timeline => timeline.tracks.some(track => track.keyframes.some(key => createdKeyIds.has(key.id))))) {
          throw new Error('Reserved clone key IDs already exist. Prepare a fresh clone plan.')
        }
        return { ...scene, layers: [...scene.layers, ...newLayers], timelines: scene.timelines.map(timeline => {
          const tracks = additions.get(timeline.id) ?? []
          if (!timelineIds.has(timeline.id)) return timeline
          const membership = new Set(occurrences.flatMap(occurrence => (timeline.layerIds ?? []).flatMap(id => occurrence.idMap[id] ? [occurrence.idMap[id]] : [])))
          tracks.forEach(track => { const parsed = parseTrackTarget(track.target); if (parsed?.entityType === 'layer') membership.add(parsed.entityId) })
          for (const layer of newLayers) if (membership.has(layer.id) && layer.parentId && createdIds.has(layer.parentId)) membership.add(layer.parentId)
          return { ...timeline, tracks: [...timeline.tracks, ...tracks], ...(timeline.layerIds && membership.size
            ? { layerIds: [...timeline.layerIds, ...Array.from(membership)] } : {}) }
        }) }
      },
      undo: scene => ({ ...scene, layers: scene.layers.filter(layer => !createdIds.has(layer.id)),
        timelines: scene.timelines.map(timeline => !timelineIds.has(timeline.id) ? timeline : { ...timeline,
          tracks: timeline.tracks.filter(track => !createdTargets.has(track.target)),
          ...(timeline.layerIds ? { layerIds: timeline.layerIds.filter(id => !createdIds.has(id)) } : {}) }) }),
    }
    return command
  }
  return { sourceRootIds: roots.map(root => root.id), atPlacements, atOffsets: offsets => atPlacements(
    Array.from({ length: count }, (_, i) => ({ roots: Object.fromEntries(Object.entries(offsets).map(([id, value]) =>
      [id, { x: value.x * (i + 1), y: value.y * (i + 1) }])) })),
  ) }
}

/** One-shot convenience for buttons/modal commands. Offsets are per root and
 * parent-local, never an evaluated pose minus authored source value. */
export function makeCloneForestCmd(scene: ChronoScene, options: CloneForestOptions & { offsets?: CloneForestOffsets }): CloneForestCommand {
  return prepareCloneForest(scene, options).atOffsets(options.offsets ?? {})
}

/** Follow Path may cancel a placement parent's motion through its world-space
 * inverse. Only references wholly inside the same copied root subtree can move
 * losslessly; all others reject translated copies without mutating source. */
function validateFollowPlacement(scene: ChronoScene, layers: readonly Layer[], roots: readonly Layer[]): void {
  const byId = new Map(scene.layers.map(layer => [layer.id, layer])), rootIds = new Set(roots.map(root => root.id))
  const rootOf = (id: string): string | undefined => {
    let layer = byId.get(id)
    while (layer && !rootIds.has(layer.id)) layer = layer.parentId ? byId.get(layer.parentId) : undefined
    return layer?.id
  }
  for (const layer of layers) if (layer.followPath && (rootIds.has(layer.id) || rootOf(layer.id) !== rootOf(layer.followPath.pathLayerId))) {
    throw new Error('Translated Follow Path copies need the follower and path inside the same selected parent subtree. Copy their parent together or use zero offset.')
  }
}

/** A wrapper adds one real parent; refuse instead of creating a portable scene
 * deeper than the existing geometry resolver's 64-parent contract. */
function assertPlacementDepth(scene: ChronoScene, root: Layer, sources: readonly Layer[]): void {
  const byId = new Map(scene.layers.map(layer => [layer.id, layer]))
  for (const source of sources) {
    let item: Layer | undefined = source, depth = 0, belongs = false
    while (item) { if (item.id === root.id) belongs = true; if (!item.parentId) break
      depth++; item = byId.get(item.parentId) }
    if (belongs && depth >= 64) throw new Error('The placement group would exceed the supported hierarchy depth.')
  }
}
