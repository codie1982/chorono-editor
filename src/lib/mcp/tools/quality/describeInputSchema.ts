import type { JsonObject } from '../../protocol'
import { parameterDescriptions, toolParameterDescriptions } from './parameterDescriptions'

const items: Readonly<Record<string, string>> = {
  keyframes: 'One authored key with a timeline-local millisecond time, typed value and optional outgoing easing.',
  actions: 'One ordered native authoring call; the name selects the schema for its arguments.',
  layerIds: 'One existing layer id, not a display name or a UI selection index.',
  timelineIds: 'One existing timeline id to evaluate or isolate in the selected editor.',
  points: 'One layer-local [x,y] coordinate pair in composition pixels.',
  'points[]': 'One layer-local coordinate in the [x,y] pair, measured in composition pixels.',
}

/** Clone a JSON-compatible schema and add documentation without narrowing it.
 * Only missing field descriptions and explicit overload corrections are filled;
 * types, required fields, bounds, defaults and additionalProperties are kept.
 * Unknown fields remain as supplied rather than receiving invented semantics.
 * All schema branches are traversed; runtime values/default objects are never
 * mistaken for nested schemas. Input is borrowed and never mutated.
 */
export function describeInputSchema(schema: JsonObject, implementationName: string): JsonObject {
  const copy = structuredClone(schema), overrides = toolParameterDescriptions[implementationName] ?? {}
  /** Visit schema containers only; paths name an array occurrence with []. */
  function visit(node: JsonObject, path = ''): void {
    for (const [key, field] of Object.entries(node.properties ?? {}) as [string, JsonObject][]) {
      if (!field || typeof field !== 'object') continue
      const childPath = path ? `${path}.${key}` : key
      const replacement = overrides[childPath] ?? overrides[key]
      if (replacement) field.description = replacement
      else if (!field.description && parameterDescriptions[key]) field.description = parameterDescriptions[key]
      visit(field, childPath)
    }
    if (Array.isArray(node.items)) node.items.forEach((field: JsonObject) => visit(field, `${path}[]`))
    else if (node.items && typeof node.items === 'object') {
      if (!node.items.description && items[path]) node.items.description = items[path]
      visit(node.items, `${path}[]`)
    }
    for (const branch of ['oneOf', 'anyOf', 'allOf']) {
      if (Array.isArray(node[branch])) node[branch].forEach((field: JsonObject) => visit(field, path))
    }
    for (const branch of ['additionalProperties', 'not', 'if', 'then', 'else', 'contains']) {
      if (node[branch] && typeof node[branch] === 'object') visit(node[branch], path)
    }
    for (const branch of ['$defs', 'definitions', 'patternProperties']) {
      for (const field of Object.values(node[branch] ?? {})) if (field && typeof field === 'object') visit(field as JsonObject, path)
    }
  }
  visit(copy)
  return copy
}
