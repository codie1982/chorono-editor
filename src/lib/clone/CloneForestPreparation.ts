import type { ChronoScene, Layer, Track } from '../types'
import { nextKfId } from '../defaults'
import { cloneSingleLayer } from './CloneSingleLayer'
import { resolveInstanceLayer } from './InstanceResolver'
import { remapCloneLayerReferences } from './CloneReferenceRemapper'
import { parseTrackTarget, remapTrackTarget } from '../timeline/TrackTargetParser'
import type { CloneForestOptions } from './CloneForestTypes'
import type { CloneMetadata } from './CloneTypes'

export interface CloneForestOccurrence {
  layers: Layer[]
  idMap: Record<string, string>
  metadata: Record<string, CloneMetadata>
  tracks: Map<string, Track[]>
  wrapperIds: Record<string, string>
}

/** Allocate one forest's serializable templates once per occurrence. Uses the
 * existing clone primitive and track-target parser; loaded IDs are reserved and
 * retried so module counters cannot collide with imported project records.
 * Independent Copy materializes a live instance's native visual source first.
 * Instance mode links appearance only, not live child topology; internal visual
 * references cannot be retargeted through that link and therefore reject. */
export function prepareCloneOccurrences(scene: ChronoScene, sources: readonly Layer[], roots: readonly Layer[],
  options: CloneForestOptions, timelineIds: ReadonlySet<string>): CloneForestOccurrence[] {
  const layerIds = new Set(scene.layers.map(layer => layer.id))
  const keyIds = new Set(scene.timelines.flatMap(timeline => timeline.tracks.flatMap(track => track.keyframes.map(key => key.id))))
  const nextKey = () => { let id = nextKfId(); while (keyIds.has(id)) id = nextKfId(); keyIds.add(id); return id }
  const result: CloneForestOccurrence[] = []
  for (let occurrence = 0; occurrence < (options.count ?? 1); occurrence++) {
    const idMap: Record<string, string> = Object.create(null), metadata: Record<string, CloneMetadata> = Object.create(null)
    let layers = sources.map(source => {
      const resolved = resolveInstanceLayer(source, scene.layers)
      if (!resolved) throw new Error('The instance source is missing, cyclic or exceeds the supported chain depth.')
      const cloneSource = options.mode === 'instance' ? source : { ...resolved, instanceOf: undefined }
      let item = cloneSingleLayer(cloneSource, { mode: options.mode ?? 'copy' })
      while (layerIds.has(item.clonedLayer.id)) item = cloneSingleLayer(cloneSource, { mode: options.mode ?? 'copy' })
      layerIds.add(item.clonedLayer.id); idMap[source.id] = item.clonedLayer.id
      metadata[item.clonedLayer.id] = item.metadata
      return item.clonedLayer
    })
    if (options.mode === 'instance') for (const source of sources) {
      const resolved = resolveInstanceLayer(source, scene.layers)!
      const withoutParent = { ...resolved, parentId: undefined }
      if (JSON.stringify(remapCloneLayerReferences(withoutParent, idMap)) !== JSON.stringify(withoutParent)) {
        throw new Error('Linked instances cannot remap internal mask/path/repeater/particle sources. Use independent Copy for this forest.')
      }
    }
    layers = layers.map(layer => remapCloneLayerReferences(layer, idMap))
    const tracks = new Map<string, Track[]>()
    for (const timeline of scene.timelines) if (timelineIds.has(timeline.id)) {
      tracks.set(timeline.id, timeline.tracks.flatMap(track => {
        const target = parseTrackTarget(track.target)
        return target?.entityType === 'layer' && idMap[target.entityId] ? [{ ...structuredClone(track),
          target: remapTrackTarget(track.target, idMap), keyframes: track.keyframes.map(key => ({ ...structuredClone(key), id: nextKey() })) }] : []
      }))
    }
    const wrapperIds: Record<string, string> = Object.create(null)
    for (const root of roots) {
      let candidate = `${idMap[root.id]}_placement`; while (layerIds.has(candidate)) candidate += '_'
      layerIds.add(candidate); wrapperIds[root.id] = candidate
    }
    result.push({ layers, idMap, metadata, tracks, wrapperIds })
  }
  return result
}
