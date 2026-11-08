import { describe, expect, it, vi } from 'vitest'
import { ParameterStore } from './ParameterStore'
import { BindingResolver } from './BindingResolver'

describe('ParameterStore revision adapter', () => {
  it('notifies only semantic changes while retaining independent typed values', () => {
    const store = new ParameterStore(), listener = vi.fn(), release = store.subscribe(listener)
    expect(store.revision).toBe(0)
    store.set('x', 0.5); store.set('x', 0.5); store.set('enabled', true); store.set('label', 'hello')
    expect(store.revision).toBe(3); expect(listener).toHaveBeenCalledTimes(3)
    store.delete('missing'); expect(store.revision).toBe(3)
    const snapshot = store.snapshot(); snapshot.set('x', 100)
    expect(store.get('x')).toBe(0.5)
    store.clear(); expect(store.revision).toBe(6)
    expect(listener.mock.calls.slice(-3)).toEqual([['x', undefined], ['enabled', undefined], ['label', undefined]])
    store.clear(); expect(store.revision).toBe(6)
    release(); release(); store.set('x', 1)
    expect(listener).toHaveBeenCalledTimes(6)
    expect(store.revision).toBe(7)
    expect(new ParameterStore().revision).toBe(0)
  })

  it('preserves the existing binding resolver and strict-equality store contract', () => {
    const store = new ParameterStore(), resolver = new BindingResolver()
    store.set('x', -0); store.set('x', 0)
    expect(store.revision).toBe(1)
    store.set('x', 0.25)
    expect(resolver.resolve([{ parameterName: 'x', targetLayerId: 'rect', targetPath: 'opacity' }], store))
      .toEqual([{ layerId: 'rect', path: 'opacity', value: 0.25 }])
    store.setMany({ x: 0.25, enabled: false })
    expect(store.revision).toBe(3)
  })
})
