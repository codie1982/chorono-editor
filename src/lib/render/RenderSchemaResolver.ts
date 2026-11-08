import type { Layer } from '@/lib/types'
import type { LayerDefinition } from '@/lib/registry/LayerDefinition'
import type { PropertySchema } from '@/lib/registry/PropertySchema'

/**
 * Compiles render validation constraints from the canonical inspector schema.
 * Only explicitly static definitions share an index between layers/frames.
 * Dynamic/custom providers run for every layer; no scene or layer is retained.
 * The weak cache is bounded by live definition objects and is invalidated if
 * their provider function changes. Registry lookup is always live, so clear or
 * replacement cannot return a removed definition's constraints.
 */
export class RenderSchemaResolver {
  private readonly staticIndexes = new WeakMap<LayerDefinition, {
    provider: LayerDefinition['getPropertyGroups']; index: ReadonlyMap<string, PropertySchema>
  }>()

  constructor(private readonly find: (layer: Layer) => LayerDefinition | undefined) {}

  /** Borrowed readonly path index. Duplicate paths retain the last schema,
   * matching the original Map constructor. showWhen remains an inspector-only
   * predicate; render clamping continues to use every published constraint. */
  resolve = (layer: Layer): ReadonlyMap<string, PropertySchema> => {
    const definition = this.find(layer)
    if (!definition) return EMPTY_SCHEMAS
    const provider = definition.getPropertyGroups
    const cached = this.staticIndexes.get(definition)
    if (definition.propertyGroupsAreStatic && cached?.provider === provider) return cached.index
    const index = new Map(provider.call(definition, layer).flatMap(group => group.schemas).map(schema => [schema.path, schema]))
    if (definition.propertyGroupsAreStatic) this.staticIndexes.set(definition, { provider, index })
    return index
  }
}

const EMPTY_SCHEMAS: ReadonlyMap<string, PropertySchema> = new Map()
