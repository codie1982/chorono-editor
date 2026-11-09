import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { utf8ByteLength } from '@/lib/format/json'
import { InteractionTrace } from '../InteractionTrace'
import { decodeTraceStorage, encodeTraceStorage, TRACE_STORAGE_MAX_BYTES } from './TraceStorageConverter'
import { TRACE_SESSION_STORAGE_KEY, TraceSessionStorage } from './TraceSessionStorage'

/** Observable tab-local storage, native event lifecycle and deterministic timer. */
function host(initial: string | null = null) {
  const values = new Map<string, string>()
  if (initial) values.set(TRACE_SESSION_STORAGE_KEY, initial)
  const storage = { getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }) }
  const events = new EventTarget(), add = vi.spyOn(events, 'addEventListener'), remove = vi.spyOn(events, 'removeEventListener')
  const ports = { storage, events: events as unknown as Window,
    schedule: (callback: () => void, delay: number) => setTimeout(callback, delay),
    cancel: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>) }
  return { values, storage, events, add, remove, ports }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('same-tab interaction trace persistence', () => {
  it('starts off and coalesces real opt-in events without an idle write loop', () => {
    const trace = new InteractionTrace(), h = host(), adapter = new TraceSessionStorage(trace, h.ports)
    vi.advanceTimersByTime(1000)
    expect(trace.getSnapshot().enabled).toBe(false); expect(h.storage.setItem).not.toHaveBeenCalled()
    trace.setEnabled(true)
    trace.recordEvent('object', 'source-start'); trace.recordEvent('object', 'source-commit')
    expect(h.storage.setItem).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(200)
    expect(h.storage.setItem).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
    expect(decodeTraceStorage(h.values.get(TRACE_SESSION_STORAGE_KEY)!, 300)?.records).toHaveLength(2)
    adapter.dispose()
  })

  it('flushes pagehide before a reload and preserves IDs/counters across boot scopes', () => {
    const old = new InteractionTrace(300, () => 10, 'boot-old'), h = host(), adapter = new TraceSessionStorage(old, h.ports)
    old.setEnabled(true); old.recordEvent('object', 'source-cancel', { reason: 'native:lostpointercapture' })
    h.events.dispatchEvent(new Event('pagehide'))
    expect(h.storage.setItem).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
    adapter.dispose(); expect(h.remove.mock.calls).toEqual(h.add.mock.calls)
    const next = new InteractionTrace(300, () => 20, 'boot-next'), restored = new TraceSessionStorage(next, h.ports)
    expect(next.getSnapshot()).toMatchObject({ enabled: true, records: [{ bootId: 'boot-old' }] })
    next.recordEvent('object', 'source-commit')
    const [first, second] = next.getSnapshot().records
    expect(second.sequence).toBeGreaterThan(first.sequence); expect(second.sessionId).toBeGreaterThan(first.sessionId)
    expect(second.bootId).toBe('boot-next')
    restored.dispose()
  })

  it('remembers Stop and preserves cleared counters even when the ring is empty', () => {
    const trace = new InteractionTrace(), h = host(), adapter = new TraceSessionStorage(trace, h.ports)
    trace.setEnabled(true); trace.recordEvent('guide', 'source-commit')
    const previous = trace.getSnapshot().records[0]
    trace.clear(); trace.setEnabled(false); adapter.dispose()
    const next = new InteractionTrace(), restored = new TraceSessionStorage(next, h.ports)
    expect(next.getSnapshot()).toMatchObject({ enabled: false, records: [] })
    next.setEnabled(true); next.recordEvent('guide', 'source-start')
    expect(next.getSnapshot().records[0].sequence).toBeGreaterThan(previous.sequence)
    expect(next.getSnapshot().records[0].sessionId).toBeGreaterThan(previous.sessionId)
    restored.dispose()
  })

  it('never overwrites already active in-memory evidence with an old persisted copy', () => {
    const old = new InteractionTrace(); old.setEnabled(true); old.recordEvent('old', 'source-cancel')
    const current = new InteractionTrace(); current.setEnabled(true); current.recordEvent('current', 'source-commit')
    const h = host(encodeTraceStorage(old.getRestoreState())), adapter = new TraceSessionStorage(current, h.ports)
    expect(current.getSnapshot().records[0].owner).toBe('current')
    adapter.dispose()
  })

  it('isolates storage denial/quota failures and disposes every subscriber/timer/listener', () => {
    const trace = new InteractionTrace(), h = host()
    h.storage.getItem.mockImplementation(() => { throw new Error('Denied') })
    h.storage.setItem.mockImplementation(() => { throw new Error('Quota') })
    const adapter = new TraceSessionStorage(trace, h.ports)
    expect(() => { trace.setEnabled(true); trace.recordEvent('object', 'source-commit'); adapter.dispose(); adapter.dispose() }).not.toThrow()
    expect(vi.getTimerCount()).toBe(0); expect(h.remove.mock.calls).toEqual(h.add.mock.calls)
    const calls = h.storage.setItem.mock.calls.length
    trace.recordEvent('object', 'late'); h.events.dispatchEvent(new Event('pagehide')); vi.advanceTimersByTime(500)
    expect(h.storage.setItem.mock.calls).toHaveLength(calls)
    expect(trace.getSnapshot().records).toHaveLength(2)
  })
})

describe('bounded storage representation conversion', () => {
  it('bounds restored records to the actual owner capacity and keeps scalar evidence immutable', () => {
    const source = new InteractionTrace(5, () => 1, 'boot-source'); source.setEnabled(true)
    for (let i = 0; i < 5; i++) source.recordEvent('shape', 'source-commit', { x: i })
    const state = decodeTraceStorage(encodeTraceStorage(source.getRestoreState()), 2)!
    expect(state.records).toHaveLength(2); expect(state.dropped).toBe(3)
    const restored = new InteractionTrace(2, () => 2, 'boot-next')
    expect(restored.restore(state)).toBe(true); expect(restored.restore(state)).toBe(false)
    expect(Object.isFrozen(restored.getSnapshot().records[0].details)).toBe(true)
    restored.recordEvent('shape', 'source-start')
    expect(restored.getSnapshot().records.at(-1)?.sequence).toBe(6)
  })

  it.each(['unsupported-version', 'invalid-counters', 'nested-details', 'bad-sequence', 'oversize', 'malformed'] as const)('ignores %s storage without enabling collection', kind => {
    const source = new InteractionTrace(); source.setEnabled(true); source.recordEvent('shape', 'source-commit')
    const parsed = JSON.parse(encodeTraceStorage(source.getRestoreState()))
    if (kind === 'unsupported-version') parsed.schemaVersion = 999
    if (kind === 'invalid-counters') parsed.state.nextSequence = 1
    if (kind === 'nested-details') parsed.state.records[0].details = { scene: { layers: ['private'] } }
    if (kind === 'bad-sequence') parsed.state.records.push(parsed.state.records[0])
    const raw = kind === 'oversize' ? ' '.repeat(TRACE_STORAGE_MAX_BYTES + 1) : kind === 'malformed' ? '{' : JSON.stringify(parsed)
    expect(decodeTraceStorage(raw, 300)).toBeUndefined()
    const trace = new InteractionTrace(), h = host(raw), adapter = new TraceSessionStorage(trace, h.ports)
    expect(trace.getSnapshot()).toMatchObject({ enabled: false, records: [] }); adapter.dispose()
  })

  it('evicts older Unicode-heavy evidence to retain the fixed UTF-8 storage budget', () => {
    const trace = new InteractionTrace(300)
    trace.setEnabled(true)
    const details = Object.fromEntries(Array.from({ length: 24 }, (_, i) => ['field' + i, '🧊'.repeat(80)]))
    for (let i = 0; i < 300; i++) trace.recordEvent('object', 'source-start', details)
    const raw = encodeTraceStorage(trace.getRestoreState()), restored = decodeTraceStorage(raw, 300)!
    expect(utf8ByteLength(raw)).toBeLessThanOrEqual(TRACE_STORAGE_MAX_BYTES)
    expect(restored.records.length).toBeLessThan(300); expect(restored.dropped).toBeGreaterThan(0)
    expect(restored.nextSequence).toBe(301); expect(restored.nextSession).toBe(301)
  })
})
