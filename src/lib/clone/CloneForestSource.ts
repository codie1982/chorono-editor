import type { ChronoScene, Layer } from '../types'
import { LayerIndex } from '../scene/LayerIndex'
import type { CloneForestOptions } from './CloneForestTypes'

/** Resolve selected roots and every descendant in authored stacking order.
 * Missing, duplicate, cyclic and orphan source hierarchies refuse before copy;
 * selection overlap never duplicates a child twice. Locked descendants remain
 * part of their copied source tree, but locked selected roots reject editing. */
export function resolveCloneForest(scene: ChronoScene, options: CloneForestOptions): { roots: Layer[]; layers: Layer[] } {
  if (!options.sourceIds.length) throw new Error('Select one or more layers to clone.')
  const index = new LayerIndex(scene.layers), selected = new Set(options.sourceIds)
  if (new Set(scene.layers.map(layer => layer.id)).size !== scene.layers.length) throw new Error('Repair duplicate layer IDs before cloning.')
  for (const id of Array.from(selected)) if (!index.get(id)) throw new Error('A clone source no longer exists.')
  const ancestors = (layer: Layer) => {
    const seen = new Set([layer.id]), result: string[] = []
    let parentId = layer.parentId
    while (parentId) {
      if (seen.has(parentId)) throw new Error('Repair the cyclic parent hierarchy before cloning.')
      if (result.length >= 64) throw new Error('Clone hierarchy exceeds the supported 64-parent depth.')
      seen.add(parentId); result.push(parentId)
      const parent = index.get(parentId)
      if (!parent) throw new Error('Repair the missing parent before cloning.')
      parentId = parent.parentId
    }
    return result
  }
  const roots = scene.layers.filter(layer => selected.has(layer.id) && !ancestors(layer).some(id => selected.has(id)))
  if (!roots.length) throw new Error('The selection has no valid clone roots.')
  if (roots.some(layer => layer.locked || layer.frozen)) throw new Error('Unlock and unfreeze selected clone roots first.')
  const ids = index.subtreeIds(roots.map(layer => layer.id)), layers = scene.layers.filter(layer => ids.has(layer.id))
  layers.forEach(ancestors)
  if (scene.bindings.some(binding => binding.target.type === 'layerProperty' && ids.has(binding.target.layerId ?? ''))
      || scene.parameterWires?.some(wire => wire.enabled && ids.has(wire.target.layerId ?? ''))) {
    throw new Error('This clone source is driven by a scene binding or parameter wire. Bake or explicitly detach that graph before cloning.')
  }
  return { roots, layers }
}

/** Reject stale source/template use while allowing unrelated data to survive.
 * Cloning borrows whole source records and all selected timeline records, so
 * replacing any one of them requires a new plan; manual edits are not replayed
 * onto an older source snapshot. Scene identity itself need not stay identical. */
export function cloneForestSourceGuard(base: ChronoScene, layers: readonly Layer[], timelineIds: ReadonlySet<string>): (scene: ChronoScene) => void {
  const records = new Map(layers.map(layer => [layer.id, layer]))
  const parentIds = new Set(layers.map(layer => layer.parentId).filter((id): id is string => !!id && !records.has(id)))
  const parents = base.layers.filter(layer => parentIds.has(layer.id))
  const timelines = base.timelines.filter(timeline => timelineIds.has(timeline.id))
  const instanceSources: Layer[] = []
  for (const source of layers) {
    let next = source.instanceOf
    const seen = new Set<string>()
    while (next && !seen.has(next)) { seen.add(next); const value = base.layers.find(layer => layer.id === next)
      if (!value) break; instanceSources.push(value); next = value.instanceOf }
  }
  return scene => {
    const index = new LayerIndex(scene.layers)
    const stale = layers.some(layer => index.get(layer.id) !== layer) || [...parents, ...instanceSources].some(layer => index.get(layer.id) !== layer)
      || scene.layers.some(layer => !records.has(layer.id) && records.has(layer.parentId ?? ''))
      || timelines.some(timeline => { const current = scene.timelines.find(value => value.id === timeline.id)
        return !current || current.durationMs !== timeline.durationMs || current.loop !== timeline.loop || current.pingPong !== timeline.pingPong
          || current.loopCount !== timeline.loopCount || current.tracks.length !== timeline.tracks.length
          || current.tracks.some((track, i) => track !== timeline.tracks[i])
          || JSON.stringify(current.layerIds) !== JSON.stringify(timeline.layerIds) })
      || scene.timelines.some(timeline => !base.timelines.some(value => value.id === timeline.id)
        && (timeline.layerIds?.some(id => records.has(id)) || timeline.tracks.some(track => layers.some(layer => track.target.startsWith(`layers.${layer.id}.`)))))
      || scene.bindings !== base.bindings || scene.parameterWires !== base.parameterWires
    if (stale) throw new Error('The clone source, hierarchy, animation or graph changed. Prepare the clone from the current scene again.')
  }
}
