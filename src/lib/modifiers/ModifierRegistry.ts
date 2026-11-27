import type { Modifier } from './Modifier'
import type { ModifierDescriptor, ModifierRecord } from './types'

export interface ModifierRegistration<TValue, TContext, TDescriptor extends ModifierDescriptor = ModifierDescriptor> {
  readonly descriptor: TDescriptor
  create(record: ModifierRecord): Modifier<TValue, TContext, TDescriptor>
  defaults(input: TValue): Readonly<Record<string, unknown>>
}
/** Owns the finite set of strategies, not scene instances. Bootstrap supplies
 * registrations; new algorithms extend this contract without editing evaluator
 * or React forms. Registration order is menu order; duplicate types refuse. */
export class ModifierRegistry<TValue, TContext, TDescriptor extends ModifierDescriptor = ModifierDescriptor> {
  private readonly entries = new Map<string, ModifierRegistration<TValue, TContext, TDescriptor>>()
  register(registration: ModifierRegistration<TValue, TContext, TDescriptor>): this {
    const type = registration.descriptor.type
    if (this.entries.has(type)) throw new Error(`Modifier already registered: ${type}`)
    this.entries.set(type, registration); return this
  }
  get(type: string): ModifierRegistration<TValue, TContext, TDescriptor> {
    const found = this.entries.get(type)
    if (!found) throw new Error(`Unknown modifier: ${type}`)
    return found
  }
  list(): readonly TDescriptor[] { return Array.from(this.entries.values(), entry => entry.descriptor) }
  create(record: ModifierRecord): Modifier<TValue, TContext, TDescriptor> {
    const registration = this.get(record.type), modifier = registration.create(record)
    if (modifier.descriptor.type !== record.type) throw new Error('Modifier factory returned a different type.')
    modifier.validate(); return modifier
  }
  /** Default records are privately owned. Context admission happens at Apply. */
  newRecord(type: string, id: string, input: TValue, enabled = true): ModifierRecord {
    const registration = this.get(type)
    return this.create({ id, type, version: 1, enabled, settings: registration.defaults(input) }).toRecord()
  }
}
