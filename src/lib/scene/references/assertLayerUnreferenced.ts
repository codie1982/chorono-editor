import type { ChronoScene } from '../../types'

/** Conservative semantic ID-token reader scan. Layer names, authoring lineage,
 * local spline IDs and Timeline membership are excluded. Unknown plugin payloads
 * are included; reference removal/retargeting must be explicit. Borrows source. */
export function assertLayerUnreferenced(scene: ChronoScene, sourceId: string, message: string): void {
  const payload = { ...scene, authoring: undefined,
    layers: scene.layers.filter(layer => layer.id !== sourceId).map(({ spline: _spline, name: _name, ...layer }) => layer),
    timelines: scene.timelines.map(({ layerIds: _ids, ...timeline }) => timeline) }
  const visit = (value: unknown): boolean => {
    if (typeof value === 'string') return value.split(/[^\w-]+/).includes(sourceId)
    return !!value && typeof value === 'object' && Object.entries(value).some(([key, item]) => visit(key) || visit(item))
  }
  if (visit(payload)) throw new Error(message)
}
