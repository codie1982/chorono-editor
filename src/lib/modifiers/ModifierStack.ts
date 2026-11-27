import type { ModifierRegistry } from './ModifierRegistry'
import type { Modifier } from './Modifier'
import type { ModifierDescriptor, ModifierStackData } from './types'

/** Domain validators borrow values and throw diagnostics, without mutating input.
 * Domain-specific topology/capability rules are injected, never switched here. */
export interface ModifierExecutionPolicy<TValue, TDescriptor> {
  validateValue(value: TValue): void
  validateInput?(descriptor: TDescriptor, value: TValue): void
  validateOutput?(descriptor: TDescriptor, value: TValue): void
}
/** General ordered execution over an immutable source and portable instance list.
 * Every invocation starts from source, never a previous result. No scene/object
 * is written here: callers commit only the complete successful return value.
 * Instances own their settings; this runner retains neither output nor cache. */
export class ModifierStack<TValue, TContext, TDescriptor extends ModifierDescriptor = ModifierDescriptor> {
  private readonly data: ModifierStackData<TValue>
  private readonly instances: readonly Modifier<TValue, TContext, TDescriptor>[]
  constructor(data: ModifierStackData<TValue>, registry: ModifierRegistry<TValue, TContext, TDescriptor>,
    private readonly policy: ModifierExecutionPolicy<TValue, TDescriptor>) {
    if (!data || data.version !== 1 || !Array.isArray(data.modifiers) || data.modifiers.length > 32)
      throw new Error('Invalid modifier stack v1 (maximum 32 entries).')
    const ids = new Set<string>()
    this.instances = data.modifiers.map(record => {
      if (ids.has(record.id)) throw new Error('Duplicate modifier instance ID.')
      ids.add(record.id)
      return registry.create(record)
    })
    // Own a detached source. The caller cannot change a pending execution by
    // mutating its original object/settings after creating this stack.
    this.data = { version: 1, source: structuredClone(data.source), modifiers: this.instances.map(item => item.toRecord()) }
    this.policy.validateValue(this.data.source)
  }
  /** Return detached portable source/list, never runtime modifier instances. */
  toRecord(): ModifierStackData<TValue> { return structuredClone(this.data) }
  /** Ordered immutable instance list; each instance privately owns its settings. */
  get modifiers(): readonly Modifier<TValue, TContext, TDescriptor>[] { return this.instances.slice() }
  /** Execute a complete stack, or a prefix when inspecting a stage's input.
   * A thrown step aborts the pipeline. Disabled records still validate settings
   * but preserve input identity and bypass enabled-step representation checks. */
  execute(context: TContext, stopBefore = this.instances.length): TValue {
    if (!Number.isInteger(stopBefore) || stopBefore < 0 || stopBefore > this.instances.length) throw new Error('Invalid modifier stack prefix.')
    let value = structuredClone(this.data.source)
    for (const modifier of this.instances.slice(0, stopBefore)) {
      try {
        if (modifier.enabled) this.policy.validateInput?.(modifier.descriptor, value)
        value = modifier.execute(value, context)
        if (modifier.enabled) this.policy.validateOutput?.(modifier.descriptor, value)
        this.policy.validateValue(value)
      } catch (error) { throw new Error(`${modifier.descriptor.label} (${modifier.id}): ${error instanceof Error ? error.message : String(error)}`) }
    }
    return value
  }
}
