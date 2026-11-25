import type { ModifierDescriptor, ModifierRecord } from './types'

/** General immutable modifier base, independent of geometry, objects and rendering. Each instance privately owns a
 * detached settings record and validates its own schema. Implementations borrow
 * input values and must return new data, never mutate input. UI and
 * persistence depend on descriptors/records, never serialize class instances. */
export abstract class Modifier<TValue, TContext, TDescriptor extends ModifierDescriptor = ModifierDescriptor> {
  private readonly record: ModifierRecord
  abstract readonly descriptor: TDescriptor
  constructor(record: ModifierRecord) {
    if (!record || record.version !== 1 || typeof record.id !== 'string' || !/^[\w-]{1,128}$/.test(record.id)
      || typeof record.type !== 'string' || !/^[\w-]{1,128}$/.test(record.type) || typeof record.enabled !== 'boolean' || !record.settings || typeof record.settings !== 'object' || Array.isArray(record.settings))
      throw new Error('Invalid modifier instance v1.')
    const settings = structuredClone(record.settings)
    assertPortable(settings)
    this.record = Object.freeze({ ...record, settings: freeze(settings) })
  }
  get id(): string { return this.record.id }
  get enabled(): boolean { return this.record.enabled }
  get settings(): Readonly<Record<string, unknown>> { return this.record.settings }
  /** Return detached serializable data; callers cannot mutate instance state. */
  toRecord(): ModifierRecord { return structuredClone(this.record) }
  abstract validate(): void
  /** Execute this instance without mutating borrowed input. Disabled instances
   * preserve input identity. The stack/domain validates representation contracts;
   * implementations validate their own settings and throw on unsupported cases. */
  execute(input: TValue, context: TContext): TValue {
    this.validate()
    return this.enabled ? this.evaluate(input, context) : input
  }
  protected abstract evaluate(input: TValue, context: TContext): TValue
}

/** Admit bounded plain JSON before any instance can own settings. */
function assertPortable(value: unknown, depth = 0, active = new Set<object>(), budget = { nodes: 0 }): void {
  if (++budget.nodes > 250000 || depth > 32) throw new Error('Modifier settings budget exceeded.')
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (typeof value !== 'object' || active.has(value) || !Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    throw new Error('Modifier settings must contain finite, acyclic plain data.')
  active.add(value)
  for (const child of Object.values(value)) if (child !== undefined) assertPortable(child, depth + 1, active, budget)
  active.delete(value)
}
/** Freeze only the privately cloned settings tree, never borrowed source. */
function freeze<T extends object>(value: T): T {
  Object.values(value).forEach(child => { if (child && typeof child === 'object') freeze(child) })
  return Object.freeze(value)
}
