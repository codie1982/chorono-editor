import { describe, expect, it, vi } from 'vitest'
import { PointerGestureSession, type PointerGestureCancelReason, type PointerGestureSample } from './PointerGestureSession'

/** Native-shaped samples with deterministic client coordinates. */
function sample(clientX = 20, clientY = 30, patch: Partial<PointerGestureSample> = {}): PointerGestureSample {
  return { pointerId: 7, clientX, clientY, shiftKey: false, metaKey: false, ctrlKey: false,
    buttons: 1, pointerType: 'mouse', ...patch }
}

/** Real EventTarget dispatch plus observable borrowed capture/listener handles. */
function fixture(options: { noStart?: boolean; button?: number; captureThrows?: boolean } = {}) {
  const events = new EventTarget(), capture = new EventTarget()
  const add = vi.spyOn(events, 'addEventListener'), remove = vi.spyOn(events, 'removeEventListener')
  const captureAdd = vi.spyOn(capture, 'addEventListener'), captureRemove = vi.spyOn(capture, 'removeEventListener')
  const setCapture = vi.fn(() => { if (options.captureThrows) throw new Error('No native capture') })
  const release = vi.fn(), move = vi.fn(), up = vi.fn(), cancel = vi.fn(), error = vi.fn()
  Object.assign(capture, { setPointerCapture: setCapture, releasePointerCapture: release })
  const session = new PointerGestureSession({ eventTarget: events as unknown as Window, move, up, cancel, error },
    options.noStart ? undefined : { pointerId: 7, currentTarget: capture as unknown as Element,
      button: options.button, pointerType: 'mouse' })
  const emit = (type: string, fields: object = {}) => {
    const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), fields)
    events.dispatchEvent(event); return event
  }
  const lost = (pointerId = 7) => capture.dispatchEvent(Object.assign(new Event('lostpointercapture'), { pointerId }))
  return { session, events, capture, add, remove, captureAdd, captureRemove, setCapture, release, move, up, cancel, error, emit, lost }
}

describe('native pointer gesture ownership', () => {
  it('captures one pointer and installs/removes matching capture-phase listeners', () => {
    const h = fixture()
    expect(h.setCapture).toHaveBeenCalledExactlyOnceWith(7)
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
      expect(h.add.mock.calls.find(call => call[0] === type)?.[2]).toBe(true)
    }
    h.session.dispose(); h.session.dispose()
    expect(h.release).toHaveBeenCalledExactlyOnceWith(7)
    expect(h.cancel).not.toHaveBeenCalled()
    expect(h.remove.mock.calls).toEqual(h.add.mock.calls)
    expect(h.captureRemove.mock.calls).toEqual(h.captureAdd.mock.calls)
  })

  it('ignores foreign moves/up/cancel/lost-capture and accepts the actual final up coordinates', () => {
    const h = fixture()
    for (const type of ['pointermove', 'pointerup', 'pointercancel']) h.emit(type, sample(100, 200, { pointerId: 8 }))
    h.lost(8)
    expect(h.move).not.toHaveBeenCalled(); expect(h.up).not.toHaveBeenCalled(); expect(h.cancel).not.toHaveBeenCalled()
    h.emit('pointermove', sample(50, 60))
    h.emit('pointerup', sample(80, 90, { buttons: 0, shiftKey: true }))
    expect(h.move).toHaveBeenCalledExactlyOnceWith(sample(50, 60))
    expect(h.up).toHaveBeenCalledExactlyOnceWith(sample(80, 90, { buttons: 0, shiftKey: true }))
    h.emit('pointermove', sample(900, 900)); h.emit('pointerup', sample(900, 900, { buttons: 0 }))
    expect(h.up).toHaveBeenCalledOnce(); expect(h.move).toHaveBeenCalledOnce()
    expect(h.release).toHaveBeenCalledOnce()
  })

  it('learns the first pointer without a native start and supports up without a move', () => {
    const h = fixture({ noStart: true })
    h.emit('pointerup', sample(40, 50, { pointerId: 12, buttons: 0 }))
    expect(h.up).toHaveBeenCalledExactlyOnceWith(sample(40, 50, { pointerId: 12, buttons: 0, pointerType: 'mouse' }))
    expect(h.setCapture).not.toHaveBeenCalled(); expect(h.release).not.toHaveBeenCalled()
  })

  it('recovers a missed up at the last pressed sample, never the later hover point', () => {
    const h = fixture(), pressed = sample(50, 60, { shiftKey: true })
    h.emit('pointermove', pressed)
    h.emit('pointermove', sample(400, 500, { buttons: 0 }))
    expect(h.move).toHaveBeenCalledExactlyOnceWith(pressed)
    expect(h.up).toHaveBeenCalledExactlyOnceWith(pressed)
    expect(h.cancel).not.toHaveBeenCalled()
    h.emit('pointerup', sample(900, 900, { buttons: 0 })); h.lost()
    expect(h.up).toHaveBeenCalledOnce(); expect(h.cancel).not.toHaveBeenCalled()
  })

  it('ends a primary gesture when only another mouse button remains held', () => {
    const h = fixture()
    h.emit('pointermove', sample(50, 60, { buttons: 5 }))
    h.emit('pointermove', sample(400, 500, { buttons: 4 }))
    expect(h.up).toHaveBeenCalledExactlyOnceWith(sample(50, 60, { buttons: 5 }))
    expect(h.move).toHaveBeenCalledOnce()
  })

  it('recovers before a new same-button down while ignoring foreign/chord down events', () => {
    const h = fixture(), pressed = sample(50, 60)
    h.emit('pointermove', pressed)
    h.emit('pointerdown', { ...sample(400, 500, { pointerId: 8 }), button: 0 })
    h.emit('pointerdown', { ...sample(400, 500, { buttons: 3 }), button: 2 })
    expect(h.up).not.toHaveBeenCalled()
    h.emit('pointerdown', { ...sample(400, 500), button: 0 })
    expect(h.up).toHaveBeenCalledExactlyOnceWith(pressed)
    expect(h.cancel).not.toHaveBeenCalled()
    expect(h.release).toHaveBeenCalledOnce()
  })

  it('cancels a stranded click before a new same-button down without inventing geometry', () => {
    const h = fixture()
    h.emit('pointerdown', { ...sample(400, 500), button: 0 })
    expect(h.up).not.toHaveBeenCalled()
    expect(h.cancel).toHaveBeenCalledExactlyOnceWith('buttonsReleased')
  })

  it('uses the middle-button mask and recovers when only primary remains', () => {
    const h = fixture({ button: 1 })
    h.emit('pointermove', sample(50, 60, { buttons: 4 }))
    h.emit('pointermove', sample(400, 500, { buttons: 1 }))
    expect(h.up).toHaveBeenCalledExactlyOnceWith(sample(50, 60, { buttons: 4 }))
  })

  it('recovers stale middle Pan before a new primary down but preserves a genuine chord', () => {
    const h = fixture({ button: 1 }), pressed = sample(50, 60, { buttons: 4 })
    h.emit('pointermove', pressed)
    h.emit('pointerdown', { ...sample(400, 500, { buttons: 5 }), button: 0 })
    expect(h.up).not.toHaveBeenCalled(); expect(h.cancel).not.toHaveBeenCalled()
    h.emit('pointerdown', { ...sample(400, 500, { buttons: 1 }), button: 0 })
    expect(h.up).toHaveBeenCalledExactlyOnceWith(pressed)
    expect(h.move).toHaveBeenCalledOnce(); expect(h.cancel).not.toHaveBeenCalled()
    expect(h.release).toHaveBeenCalledOnce()
  })

  it('cancels release recovery with no pressed movement rather than creating a click', () => {
    const h = fixture()
    h.emit('pointermove', sample(400, 500, { buttons: 0 }))
    expect(h.move).not.toHaveBeenCalled(); expect(h.up).not.toHaveBeenCalled()
    expect(h.cancel).toHaveBeenCalledExactlyOnceWith('buttonsReleased')
    expect(h.release).toHaveBeenCalledOnce()
  })

  it('preserves legacy samples without a finite button mask and copies recovery data', () => {
    const h = fixture(), pressed = sample(50, 60, { buttons: undefined })
    h.move.mockImplementation((point: PointerGestureSample) => { point.clientX = 999 })
    h.emit('pointermove', pressed)
    h.emit('pointermove', sample(400, 500, { buttons: NaN }))
    h.emit('pointermove', sample(800, 900, { buttons: 0 }))
    expect(h.up).toHaveBeenCalledExactlyOnceWith(sample(400, 500, { buttons: NaN }))
  })

  it.each<[{ type: string; reason: PointerGestureCancelReason }]>([
    [{ type: 'pointercancel', reason: 'pointercancel' }],
    [{ type: 'blur', reason: 'blur' }],
    [{ type: 'keydown', reason: 'escape' }],
  ])('cancels and releases exactly once for $type', ({ type, reason }) => {
    const h = fixture()
    const event = h.emit(type, type === 'keydown' ? { key: 'Escape' } : sample())
    expect(h.cancel).toHaveBeenCalledExactlyOnceWith(reason)
    expect(h.release).toHaveBeenCalledOnce()
    if (type === 'keydown') expect(event.defaultPrevented).toBe(true)
    h.emit(type, sample()); h.lost()
    expect(h.cancel).toHaveBeenCalledOnce()
  })

  it('cancels actual lost capture, while unmount disposal stays callback-free', () => {
    const lost = fixture(); lost.lost()
    expect(lost.cancel).toHaveBeenCalledExactlyOnceWith('lostpointercapture')
    const unmounted = fixture(); unmounted.session.dispose(); unmounted.lost(); unmounted.emit('blur')
    expect(unmounted.cancel).not.toHaveBeenCalled(); expect(unmounted.up).not.toHaveBeenCalled()
  })

  it('keeps accepts valid during up and supports reentrant host disposal/terminal events', () => {
    const h = fixture(), final = sample(80, 90, { buttons: 0 })
    h.up.mockImplementation((point: PointerGestureSample) => {
      expect(h.session.accepts(point)).toBe(true)
      h.emit('pointerup', final); h.session.cancel('blur')
      h.session.dispose()
    })
    h.emit('pointerup', final)
    expect(h.up).toHaveBeenCalledOnce(); expect(h.cancel).not.toHaveBeenCalled()
    expect(h.release).toHaveBeenCalledOnce(); expect(h.session.accepts(final)).toBe(false)
  })

  it('falls back to window events after failed capture and still cleans up', () => {
    const h = fixture({ captureThrows: true })
    h.emit('pointerup', sample(80, 90, { buttons: 0 }))
    expect(h.up).toHaveBeenCalledOnce(); expect(h.error).not.toHaveBeenCalled()
    expect(h.remove.mock.calls).toEqual(h.add.mock.calls)
    expect(h.release).toHaveBeenCalledOnce()
  })

  it.each(['move', 'up'] as const)('cancels callback failure in %s and releases even if diagnostics throw', method => {
    const h = fixture(), failure = new Error('Domain adapter failed')
    h[method].mockImplementation(() => { throw failure })
    h.error.mockImplementation(() => { throw new Error('Diagnostic failed') })
    h.emit(method === 'move' ? 'pointermove' : 'pointerup', sample())
    expect(h.error).toHaveBeenCalledWith(failure)
    expect(h.cancel).toHaveBeenCalledExactlyOnceWith('error')
    expect(h.release).toHaveBeenCalledOnce()
    expect(h.remove.mock.calls).toEqual(h.add.mock.calls)
  })
})
