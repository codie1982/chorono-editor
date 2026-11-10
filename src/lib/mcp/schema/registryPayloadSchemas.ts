import { layerRegistry } from '../../registry'
import type { PropertySchema } from '../../registry/PropertySchema'

type Schema = Record<string, any>

/** Convert existing inspector property metadata to partial JSON payload hints.
 * This adapter never calls showWhen: hidden controls still describe valid
 * source fields. UI ranges/defaults are not validation bounds; e.g. a slider's
 * display range is not the domain's allowed animation/material range. Unknown
 * fields stay open for non-inspector data and registered extensions, with final
 * validation owned by the existing command/protocol rather than a copied model.
 * Nested addresses carry properties without a type gate so legacy null clearing
 * and scalar/array replacement reach the same domain checks as before.
 * Returned schema objects are fresh and own no scene/runtime resources. */
export function layerPatchSchema(): Schema {
  const schema: Schema = { type: 'object', description: 'Partial Layer source data. Nested objects replace their previous value in this legacy API; read the current layer and include siblings to preserve them. Registry property groups below are hints, not an exhaustive Layer schema.', properties: {} }
  for (const definition of layerRegistry.getAll()) {
    for (const group of definition.getPropertyGroups(definition.createDefault())) {
      for (const property of group.schemas) addProperty(schema, property)
    }
  }
  return schema
}

/** Reuse the emitter definition's own config paths as deep-merge patch hints.
 * Non-inspector fields (life gradients, motion modifiers, source references)
 * remain accepted and are validated by the existing ParticleHandle adapter.
 * Arrays replace rather than merge by element; scalar units belong to the
 * property descriptions and ParticleEmitterData/script reference. */
export function particlePatchSchema(): Schema {
  const layer = layerPatchSchema()
  return { ...(layer.properties?.particleEmitter ?? {}), type: 'object',
    description: 'Deep partial ParticleEmitterData: emitter, particle, animation, random and rendering. Objects merge; arrays/scalars replace. Read existing config or scripting particle reference for life stops and motion modifiers. Existing particle validator rejects unsupported flow/burstMarkers and invalid units.' }
}

/** Build a nested payload address from an authoritative descriptor. Do not
 * copy constraints or turn UI select options into a narrower transport enum. */
function addProperty(root: Schema, property: PropertySchema): void {
  const parts = property.path.split('.')
  if (parts.some(part => !part || ['__proto__', 'prototype', 'constructor'].includes(part))) return
  let node = root
  for (const part of parts.slice(0, -1)) {
    node.properties ??= {}
    node.properties[part] ??= { description: `Source ${part} field; preserve existing siblings when using shallow replacement. Clearing/replacement validity is decided by the existing domain command.`, properties: {} }
    node = node.properties[part]
  }
  node.properties ??= {}
  const key = parts[parts.length - 1]
  const select = property.options?.map(option => option.value).join(', ')
  node.properties[key] ??= { description: `${property.group}: ${property.label}. Source path ${property.path}; editor value type ${property.valueType}.${property.help ? ` ${property.help}` : ''}${select ? ` Inspector options: ${select}.` : ''}` }
}
