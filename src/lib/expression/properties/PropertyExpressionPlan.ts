import type { ChronoScene, Layer, ParameterWire } from '../../types'
import type { PropertyExpression } from './PropertyExpression'
import { MAX_PROPERTY_EXPRESSIONS } from './PropertyExpression'
import { dependencyOrder } from '../../core/graph/dependencyOrder'
import { paramRefKey } from '../../wiring/helpers'
import { LayerIndex } from '../../scene/LayerIndex'
import type { LayerLookup } from '../../scene/LayerIndex'
import { resolveInstanceLayer } from '../../clone/InstanceResolver'
import { propertyPathsOverlap } from '../../scene/properties/propertyPathsOverlap'

export interface PropertyExpressionEntry { readonly layer: Layer; readonly path: string; readonly key: string; readonly definition: PropertyExpression }
export interface PropertyExpressionPlan {
  readonly expressions: ReadonlyMap<string, PropertyExpressionEntry>
  readonly wires: ReadonlyMap<string, readonly ParameterWire[]>
  readonly order: readonly string[]
  readonly blocked: ReadonlySet<string>
  readonly animated: ReadonlySet<string>
  readonly index?: LayerIndex
  readonly resolvedIndex?: LayerLookup
  readonly error?: string
}

/** One immutable source graph. Owns only lightweight source references and an
 * index; no AST, time or evaluated values. Cache owner must be weak or dispose
 * on source replacement. Legacy wires and named expressions share cycle checks.
 * Duplicate legacy wire targets retain their authored order/last-writer policy. */
export function preparePropertyExpressionPlan(scene: ChronoScene): PropertyExpressionPlan {
  const expressions = new Map<string, PropertyExpressionEntry>(), wires = new Map<string, ParameterWire[]>()
  for (const layer of scene.layers) for (const [path, definition] of Object.entries(layer.propertyExpressions?.fields ?? {})) {
    const key = 'layers.' + layer.id + '.' + path
    if (expressions.size >= MAX_PROPERTY_EXPRESSIONS) return { expressions, wires, order: [], blocked: new Set(), animated: new Set(), error: 'Scene exceeds 512 live expressions; bake or reduce drivers.' }
    expressions.set(key, { layer, path, key, definition })
  }
  if (!expressions.size) return { expressions, wires, order: [], blocked: new Set(), animated: new Set() }
  const edges: [string, string][] = []
  for (const wire of scene.parameterWires ?? []) if (wire.enabled) {
    const key = paramRefKey(wire.target), records = wires.get(key) ?? []
    records.push(wire); wires.set(key, records)
  }
  const targets = [...Array.from(expressions.keys()), ...Array.from(wires.keys())]
  const edge = (source: string, target: string) => {
    const owners = targets.filter(key => propertyPathsOverlap(key, source))
    for (const owner of owners.length ? owners : [source]) edges.push([owner, target])
  }
  for (const records of Array.from(wires.values())) for (const wire of records) edge(paramRefKey(wire.source), paramRefKey(wire.target))
  for (const entry of Array.from(expressions.values())) for (const source of Object.values(entry.definition.sources)) edge(paramRefKey(source), entry.key)
  const { order, blocked } = dependencyOrder([...Array.from(expressions.keys()), ...Array.from(wires.keys())], edges)
  const animated = new Set(scene.timelines.flatMap(timeline => timeline.tracks.filter(track => track.keyframes.length || track.controller).map(track => track.target)))
  const index = new LayerIndex(scene.layers)
  const resolvedIndex: LayerLookup = { get: id => { const layer = index.get(id); return layer ? resolveInstanceLayer(layer, scene.layers, 0, index) ?? undefined : undefined } }
  expressions.forEach((entry, key) => expressions.set(key, { ...entry, layer: resolvedIndex.get(entry.layer.id) ?? entry.layer }))
  return { expressions, wires, order, blocked, animated, index, resolvedIndex }
}
