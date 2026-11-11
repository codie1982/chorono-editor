import type { Binding, ChronoScene, ParameterRef } from '../../types'
import { paramRefKey } from '../../wiring/helpers'
import { preparePropertyExpressionPlan } from './PropertyExpressionPlan'

/** Build a private read-only evaluation scope for one property sample job.
 * Traverse named expression, Wire and linear-binding source references once;
 * retain referenced native tracks and original timeline clocks. Unrelated
 * layers/tracks are excluded from repeated sampling, not evicted from the real
 * scene. Instance source/parent records remain available for schema resolution.
 * Source records are borrowed or shallowly adapted; no JSON/Undo is produced.
 * Conservative dependency inclusion preserves legacy pre-pass source semantics.
 */
export function propertyExpressionScope(scene: ChronoScene, target: ParameterRef): ChronoScene {
  const plan = preparePropertyExpressionPlan(scene), refs = new Map<string, ParameterRef>(), queue: ParameterRef[] = []
  const enqueue = (ref: ParameterRef) => { const key = paramRefKey(ref); if (!refs.has(key)) { refs.set(key, ref); queue.push(ref) } }
  const bindings = new Map<string, Binding[]>()
  for (const binding of scene.bindings) {
    const target = binding.target, key = target.type === 'layerProperty' ? 'layers.' + target.layerId + '.' + target.property
      : target.type === 'parameter' ? 'params.' + target.paramId : ''
    const list = bindings.get(key) ?? []; list.push(binding); bindings.set(key, list)
  }
  enqueue(target)
  for (let index = 0; index < queue.length; index++) {
    const key = paramRefKey(queue[index]), entry = plan.expressions.get(key)
    if (entry) Object.values(entry.definition.sources).forEach(enqueue)
    for (const wire of plan.wires.get(key) ?? []) enqueue(wire.source)
    for (const binding of bindings.get(key) ?? []) if (binding.source.type === 'layerProperty' && binding.source.layerId && binding.source.property) {
      enqueue({ layerId: binding.source.layerId, propertyPath: binding.source.property, valueType: 'number' })
    }
  }
  const byId = new Map(scene.layers.map(layer => [layer.id, layer])), ids = new Set<string>()
  for (const ref of queue) if (ref.layerId) {
    const pending = [ref.layerId]
    while (pending.length) {
      const id = pending.pop()!
      if (ids.has(id)) continue
      ids.add(id); const layer = byId.get(id)
      if (layer?.instanceOf) pending.push(layer.instanceOf)
      if (layer?.parentId) pending.push(layer.parentId)
    }
  }
  return { ...scene, layers: scene.layers.filter(layer => ids.has(layer.id)).map(layer => {
    if (!layer.propertyExpressions) return layer
    const fields = Object.fromEntries(Object.entries(layer.propertyExpressions.fields).filter(([path]) => refs.has('layers.' + layer.id + '.' + path)))
    return { ...layer, propertyExpressions: Object.keys(fields).length ? { version: 1, fields } : undefined }
  }), timelines: scene.timelines.map(timeline => ({ ...timeline, tracks: timeline.tracks.filter(track => refs.has(track.target)) })),
  bindings: Array.from(bindings).filter(([key]) => refs.has(key)).flatMap(([, records]) => records),
  parameterWires: scene.parameterWires?.filter(wire => refs.has(paramRefKey(wire.target))) }
}
