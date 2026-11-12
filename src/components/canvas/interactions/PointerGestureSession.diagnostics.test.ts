import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PointerGestureSession } from './PointerGestureSession'
import { interactionTrace } from './diagnostics'

/** Native-shaped EventTarget input without DOM/source ownership. */
function fixture(connected?: boolean) {
  const target = new EventTarget(), move = vi.fn(), up = vi.fn(), cancel = vi.fn()
  const capture = new EventTarget()
  Object.assign(capture, { isConnected: connected, setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() })
  const session = new PointerGestureSession({ eventTarget: target as unknown as Window, move, up, cancel,
    diagnostics: { owner: 'test-pan', details: { sourceSessionId: 7 } } },
    connected === undefined ? undefined : { pointerId: 1, currentTarget: capture as unknown as Element })
  const emit = (type: string, x: number, buttons = 1, pointerId = 1) => target.dispatchEvent(Object.assign(new Event(type), {
    pointerId, clientX: x, clientY: 0, buttons, pointerType: 'mouse', shiftKey: false, metaKey: false, ctrlKey: false }))
  const lost = (buttons = 0) => capture.dispatchEvent(Object.assign(new Event('lostpointercapture'), { pointerId: 1, buttons }))
  return { session, move, up, cancel, emit, lost }
}

beforeEach(() => { interactionTrace.clear(); interactionTrace.setEnabled(true) })
afterEach(() => { interactionTrace.setEnabled(false); interactionTrace.clear() })

describe('native pointer lifecycle evidence', () => {
  it('summarizes pressed movement once and records real up coordinates', () => {
    const h = fixture()
    for (let x = 1; x <= 30; x++) h.emit('pointermove', x)
    h.emit('pointerup', 40, 0)
    const records = interactionTrace.getSnapshot().records
    expect(records.filter(record => record.event === 'native-first-move')).toHaveLength(1)
    expect(records.find(record => record.event === 'native-up')?.details).toMatchObject({ moves: 30, clientX: 40, buttons: 0 })
    expect(h.up).toHaveBeenCalledOnce(); expect(h.move).toHaveBeenCalledTimes(30)
    expect(records.filter(record => record.event === 'native-dispose')).toHaveLength(1)
    expect(records.length).toBeLessThan(10)
  })

  it('identifies missing-up recovery without treating later hover as pressed geometry', () => {
    const h = fixture(); h.emit('pointermove', 20); h.emit('pointermove', 300, 0)
    const records = interactionTrace.getSnapshot().records
    expect(records.find(record => record.event === 'native-recovery')?.details).toMatchObject({ reason: 'released-buttons-move', clientX: 20 })
    expect(records.find(record => record.event === 'native-up')?.details.clientX).toBe(20)
    expect(h.up.mock.calls[0][0].clientX).toBe(20); expect(h.cancel).not.toHaveBeenCalled()
  })

  it('logs the first foreign pointer rejection and a total without event flooding', () => {
    const h = fixture(); h.emit('pointermove', 10)
    for (let x = 0; x < 25; x++) h.emit('pointermove', x, 1, 2)
    h.emit('pointercancel', 20)
    const records = interactionTrace.getSnapshot().records
    expect(records.filter(record => record.event === 'native-rejected')).toHaveLength(1)
    expect(records.find(record => record.event === 'native-cancel')?.details).toMatchObject({ reason: 'pointercancel', rejectedSamples: 25, moves: 1 })
    expect(h.cancel).toHaveBeenCalledExactlyOnceWith('pointercancel')
  })

  it('records only an error category while preserving callback-error cancellation', () => {
    const h = fixture(); h.move.mockImplementation(() => { throw new Error('Private scene information') })
    h.emit('pointermove', 10)
    expect(h.cancel).toHaveBeenCalledExactlyOnceWith('error')
    const record = interactionTrace.getSnapshot().records.find(item => item.event === 'native-error')!
    expect(record.details).toEqual({ reason: 'callback-error', errorType: 'Error' })
    expect(interactionTrace.exportJson()).not.toContain('Private scene information')
  })

  it('distinguishes recoverable capture loss from cancellation and records its own button state', () => {
    const h = fixture(true); h.emit('pointermove', 20); h.lost(0)
    const records = interactionTrace.getSnapshot().records
    expect(records.find(item => item.event === 'native-capture-lost')?.details).toMatchObject({
      reason: 'window-fallback', captureConnected: true, eventButtons: 0, buttons: 1, moves: 1 })
    expect(records.some(item => item.event === 'native-cancel')).toBe(false)
    expect(h.up).not.toHaveBeenCalled(); expect(h.cancel).not.toHaveBeenCalled()
    h.emit('pointerup', 40, 0)
    expect(h.up).toHaveBeenCalledOnce()
    expect(interactionTrace.getSnapshot().records.find(item => item.event === 'native-up')?.details.clientX).toBe(40)
  })

  it('records disconnected target capture loss as a real cancellation', () => {
    const h = fixture(false); h.emit('pointermove', 20); h.lost()
    const records = interactionTrace.getSnapshot().records
    expect(records.find(item => item.event === 'native-capture-lost')?.details).toMatchObject({
      reason: 'capture-disconnected', captureConnected: false })
    expect(h.cancel).toHaveBeenCalledExactlyOnceWith('lostpointercapture')
    h.emit('pointerup', 40, 0); expect(h.up).not.toHaveBeenCalled()
  })
})
