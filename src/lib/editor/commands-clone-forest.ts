import type { ChronoScene, Layer } from '../types'
import { parseTrackTarget } from '../timeline/TrackTargetParser'
import { resolveCloneForest, cloneForestSourceGuard } from '../clone/CloneForestSource'
import { prepareCloneOccurrences } from '../clone/CloneForestPreparation'
import { needsClonePlacementGroup, translateCloneTrack, clonePlacementGroup } from '../clone/CloneForestPlacement'
import { assertCloneForestBudget } from '../clone/CloneWorkload'
import type { CloneForestCommand, CloneForestOffsets, CloneForestOptions, PreparedCloneForest } from '../clone/CloneForestTypes'
export type { CloneForestCommand, CloneForestOffsets, CloneForestOptions, PreparedCloneForest } from '../clone/CloneForestTypes'

/** Prepare independent source/subtree/animation templates once. Ordinary root
 * position keys receive the same parent-local translation as static source;
 * driven inputs are preserved behind a named placement parent. No IDs are
 * allocated by atOffsets, making source+clone drag previews and redo stable.
 * Default animation scope is all source timelines, unlike the legacy one-TL API.
 * Scene binding/wire targets reject rather than silently losing their graph.
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
  return { sourceRootIds: roots.map(root => root.id), atOffsets: offsets => {
    if (Object.keys(offsets).some(id => !rootIds.has(id))) throw new Error('Clone offsets must address selected forest roots.')
    for (const offset of Object.values(offsets)) if (![offset.x, offset.y].every(Number.isFinite)) throw new Error('Clone offsets must be finite parent-local coordinates.')
    const translated = roots.some(root => (offsets[root.id]?.x ?? 0) !== 0 || (offsets[root.id]?.y ?? 0) !== 0)
    if (translated) validateFollowPlacement(base, layers, roots)
    const newLayers: Layer[] = [], additions = new Map<string, ReturnType<typeof translateCloneTrack>[]>()
    const selection: string[] = [], diagnostics: string[] = []
    const metadata = Object.assign({}, ...occurrences.map(occurrence => occurrence.metadata))
    for (let i = 0; i < occurrences.length; i++) {
      const occurrence = occurrences[i], rootOffsets: Record<string, { x: number; y: number }> = Object.create(null)
      const rootCopies = new Map(roots.map(root => [occurrence.idMap[root.id], root]))
      for (const template of occurrence.layers) {
        const root = rootCopies.get(template.id)
        if (!root) { newLayers.push(template); continue }
        const offset = offsets[root.id] ?? { x: 0, y: 0 }, x = offset.x * (i + 1), y = offset.y * (i + 1)
        if (![x, y].every(Number.isFinite)) throw new Error('Clone occurrence placement would overflow its transform.')
        if ((x || y) && placement.has(root.id)) {
          assertPlacementDepth(base, root, layers)
          const group = clonePlacementGroup(root, occurrence.wrapperIds[root.id], x, y)
          newLayers.push(group, { ...template, parentId: group.id }); selection.push(group.id)
          metadata[group.id] = { ...occurrence.metadata[template.id], sourceId: root.id }
          diagnostics.push(`'${root.name}' uses an explicit Placement group to preserve its driven animation.`)
        } else {
          if (![template.transform.x + x, template.transform.y + y].every(Number.isFinite)) throw new Error('Clone placement would overflow its transform.')
          newLayers.push({ ...template, transform: { ...template.transform, x: template.transform.x + x, y: template.transform.y + y } })
          rootOffsets[template.id] = { x, y }; selection.push(template.id)
        }
      }
      occurrence.tracks.forEach((tracks, timelineId) => additions.set(timelineId,
        [...(additions.get(timelineId) ?? []), ...tracks.map(track => translateCloneTrack(track, rootOffsets))]))
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
        assertCloneForestBudget(scene, ids, count, { extraLayersPerOccurrence: (newLayers.length - layers.length * count) / count, timelineIds })
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
  } }
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
