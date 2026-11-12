import { describe, expect, it, vi } from 'vitest'
import { InteractionTrace } from './InteractionTrace'
import type { InteractionTraceDetails } from './types'

describe('bounded local interaction diagnostics', () => {
  it('is disabled by default and does not allocate records or notify observers', () => {
    const trace = new InteractionTrace(), listener = vi.fn(), initial = trace.getSnapshot()
    trace.subscribe(listener)
    expect(trace.begin('shape')).toBeUndefined()
    trace.recordEvent('shape', 'rejected', { reason: 'busy' })
    expect(trace.getSnapshot()).toBe(initial)
    expect(listener).not.toHaveBeenCalled()
  })

  it('publishes stable immutable snapshots only when collection state changes', () => {
    const trace = new InteractionTrace(), listener = vi.fn()
    const off = trace.subscribe(listener), disabled = trace.getSnapshot()
    trace.setEnabled(true)
    const enabled = trace.getSnapshot()
    trace.setEnabled(true)
    expect(enabled).not.toBe(disabled)
    expect(trace.getSnapshot()).toBe(enabled)
    expect(Object.isFrozen(enabled)).toBe(true)
    expect(listener).toHaveBeenCalledOnce()
    off(); off(); trace.setEnabled(false)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('evicts only the oldest events while old snapshots remain unchanged', () => {
    const trace = new InteractionTrace(2, () => 100)
    trace.setEnabled(true)
    const session = trace.begin('object-move')!
    session.record('start'); session.record('first-preview')
    const previous = trace.getSnapshot()
    session.record('commit', { x: 10, y: 20 })
    const current = trace.getSnapshot()
    expect(previous.records.map(record => record.event)).toEqual(['start', 'first-preview'])
    expect(current.records.map(record => record.event)).toEqual(['first-preview', 'commit'])
    expect(current.dropped).toBe(1)
    expect(current.records.every(record => record.sessionId === session.id && record.timeMs === 100)).toBe(true)
    expect(current.records.map(record => record.sequence)).toEqual([2, 3])
    expect(Object.isFrozen(current.records)).toBe(true)
  })

  it('copies and bounds scalar metadata without retaining source-like payloads', () => {
    const trace = new InteractionTrace()
    trace.setEnabled(true)
    const input = { x: 12, reason: 'a'.repeat(200), nonfinite: Infinity,
      scene: { layers: ['secret'] } } as unknown as Record<string, string | number>
    trace.recordEvent('o'.repeat(100), 'e'.repeat(100), input as InteractionTraceDetails)
    input.x = 999
    const record = trace.getSnapshot().records[0]
    expect(record.owner).toHaveLength(80); expect(record.event).toHaveLength(80)
    expect(record.details.x).toBe(12)
    expect(record.details.reason).toHaveLength(160)
    expect(record.details).not.toHaveProperty('scene')
    expect(record.details).not.toHaveProperty('nonfinite')
    expect(Object.isFrozen(record)).toBe(true); expect(Object.isFrozen(record.details)).toBe(true)
  })

  it('stops collection without deleting evidence and clears without reusing IDs', () => {
    const trace = new InteractionTrace(1)
    trace.setEnabled(true)
    const first = trace.begin('guide')!
    first.record('start'); first.record('commit')
    trace.setEnabled(false)
    const stopped = trace.getSnapshot()
    first.record('late')
    expect(trace.getSnapshot()).toBe(stopped)
    trace.clear()
    expect(trace.getSnapshot()).toMatchObject({ enabled: false, records: [], dropped: 0 })
    trace.setEnabled(true)
    const second = trace.begin('guide')!
    second.record('start')
    expect(second.id).toBeGreaterThan(first.id)
    expect(trace.getSnapshot().records[0].sequence).toBeGreaterThan(2)
  })

  it('isolates throwing subscribers and exports detached versioned scalar evidence', () => {
    const trace = new InteractionTrace(5, () => 1234), listener = vi.fn()
    trace.subscribe(() => { throw new Error('Observer failed') }); trace.subscribe(listener)
    expect(() => { trace.setEnabled(true); trace.recordEvent('shape', 'cancel', { reason: 'blur', active: false }) }).not.toThrow()
    expect(listener).toHaveBeenCalledTimes(2)
    const output = JSON.parse(trace.exportJson())
    expect(output).toMatchObject({ schemaVersion: 1, scope: 'local-editor-interactions', exportedAtMs: 1234,
      records: [{ event: 'cancel', details: { reason: 'blur', active: false } }] })
    output.records[0].details.reason = 'changed'
    expect(trace.getSnapshot().records[0].details.reason).toBe('blur')
  })

  it.each([0, -1, 1.5, 1001, NaN])('rejects unbounded/invalid capacity %s', capacity => {
    expect(() => new InteractionTrace(capacity)).toThrow(RangeError)
  })
})
