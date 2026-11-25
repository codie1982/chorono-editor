import { describe, expect, it } from 'vitest'
import { Modifier } from '../Modifier'
import { ModifierRegistry } from '../ModifierRegistry'
import { ModifierStack } from '../ModifierStack'
import type { ModifierDescriptor, ModifierRecord, ModifierStackData } from '../types'

/** Deliberately non-geometric extension: the shared base/registry/executor must
 * work with arithmetic values without importing spline, mesh or scene state. */
class Add extends Modifier<number, void> {
  static readonly descriptor: ModifierDescriptor = { type: 'add', label: 'Add', category: 'arithmetic', fields: [], addable: true }
  readonly descriptor = Add.descriptor
  validate() { if (typeof this.settings.amount !== 'number' || !Number.isFinite(this.settings.amount)) throw new Error('Finite amount required.') }
  protected evaluate(input: number) { return input + (this.settings.amount as number) }
}
/** A second independently registered strategy demonstrates ordered composition. */
class Multiply extends Add {
  static readonly descriptor = { ...Add.descriptor, type: 'multiply', label: 'Multiply' }
  readonly descriptor = Multiply.descriptor
  protected evaluate(input: number) { return input * (this.settings.amount as number) }
}
/** Failure must never publish a partial result to the caller's object. */
class Fail extends Add {
  static readonly descriptor = { ...Add.descriptor, type: 'fail', label: 'Fail' }
  readonly descriptor = Fail.descriptor
  protected evaluate(): number { throw new Error('Solver refused.') }
}
const policy = { validateValue(value: number) { if (!Number.isFinite(value)) throw new Error('Invalid number.') } }
/** Runtime composition root; neither the base nor runner knows concrete types. */
function registry() {
  return new ModifierRegistry<number, void>()
    .register({ descriptor: Add.descriptor, create: record => new Add(record), defaults: () => ({ amount: 3 }) })
    .register({ descriptor: Multiply.descriptor, create: record => new Multiply(record), defaults: () => ({ amount: 2 }) })
    .register({ descriptor: Fail.descriptor, create: record => new Fail(record), defaults: () => ({ amount: 0 }) })
}
function recipe(modifiers: readonly ModifierRecord[]): ModifierStackData<number> { return { version: 1, source: 10, modifiers } }

describe('general Modifier / ModifierRegistry / ModifierStack.execute', () => {
  it('runs the registered list in order, from original source on every execute', () => {
    const r = registry(), add = r.newRecord('add', 'a', 10), multiply = r.newRecord('multiply', 'b', 10)
    const stack = new ModifierStack(recipe([add, multiply]), r, policy)
    expect(stack.execute()).toBe(26)
    expect(stack.execute()).toBe(26)
    expect(stack.execute(undefined, 1)).toBe(13)
    expect(new ModifierStack(recipe([multiply, add]), r, policy).execute()).toBe(23)
    expect(stack.toRecord().source).toBe(10)
    expect(stack.modifiers.map(item => item.id)).toEqual(['a', 'b'])
  })
  it('keeps settings private and detached from pending input/exported records', () => {
    const settings = { amount: 5, nested: { value: 1 } }
    const instance = new Add({ id: 'a', type: 'add', version: 1, enabled: true, settings })
    settings.amount = 20; settings.nested.value = 2
    expect(instance.execute(10, undefined)).toBe(15)
    expect(instance.settings.nested).toEqual({ value: 1 })
    expect(() => { (instance.settings.nested as { value: number }).value = 99 }).toThrow()
    const detached = instance.toRecord(); (detached.settings as { amount: number }).amount = 99
    expect(instance.execute(10, undefined)).toBe(15)
  })
  it('owns a pending list unaffected by later source-record changes', () => {
    const r = registry(), record = structuredClone(r.newRecord('add', 'a', 10)), data = recipe([record])
    const stack = new ModifierStack(data, r, policy)
    ;(record.settings as { amount: number }).amount = 999
    const output = stack.toRecord(); (output.modifiers[0].settings as { amount: number }).amount = 888
    expect(stack.execute()).toBe(13)
  })
  it('skips disabled execution while validating its own settings', () => {
    const r = registry(), fail = r.newRecord('fail', 'f', 10, false)
    expect(new ModifierStack(recipe([fail]), r, policy).execute()).toBe(10)
    expect(() => new ModifierStack(recipe([{ ...fail, settings: { amount: 'invalid' } }]), r, policy)).toThrow(/Finite amount/)
  })
  it('aborts on errors, identifying the failing instance and preserving object state', () => {
    const r = registry(), object = { value: 10 }, data = recipe([r.newRecord('add', 'a', 10), r.newRecord('fail', 'f', 10)])
    expect(() => { object.value = new ModifierStack(data, r, policy).execute() }).toThrow(/Fail \(f\): Solver refused/)
    expect(object.value).toBe(10)
  })
  it('validates each intermediate result and rejects duplicate/unknown registrations', () => {
    const r = registry()
    expect(() => r.register(r.get('add'))).toThrow(/already registered/)
    expect(() => r.get('unknown')).toThrow(/Unknown modifier/)
    expect(() => new ModifierStack(recipe([r.newRecord('add', 'a', 10), r.newRecord('multiply', 'a', 10)]), r, policy)).toThrow(/Duplicate/)
    expect(() => new ModifierStack(recipe([{ id: 'x', type: 'unknown', version: 1, enabled: true, settings: {} }]), r, policy)).toThrow(/Unknown/)
    expect(() => new ModifierStack({ version: 1, source: Infinity, modifiers: [] }, r, policy)).toThrow(/Invalid number/)
  })
  it('bounds instance lists and rejects non-portable settings', () => {
    const r = registry()
    expect(() => new ModifierStack(recipe(Array.from({ length: 33 }, (_, i) => r.newRecord('add', `a${i}`, 10))), r, policy)).toThrow(/maximum 32/)
    expect(() => new Add({ id: 'a', type: 'add', version: 1, enabled: true, settings: { amount: 1, bad: new Date() } })).toThrow(/plain data/)
    const cyclic: Record<string, unknown> = { amount: 1 }; cyclic.cycle = cyclic
    expect(() => new Add({ id: 'a', type: 'add', version: 1, enabled: true, settings: cyclic })).toThrow(/acyclic/)
  })
})
