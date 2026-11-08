import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { DEFAULT_TIMELINE_SETTINGS } from '@/lib/types'
import { newTimeline } from '@/lib/defaults'
import { useKeyframeDrag, type DragSnapshot } from './useKeyframeDrag'

afterEach(() => vi.unstubAllGlobals())

function harness(snapEnabled = false) {
  const listeners = new Map<string, EventListener>()
  const frames = new Map<number, FrameRequestCallback>()
  let frameId = 0
  vi.stubGlobal('window', {
    addEventListener: (name: string, listener: EventListener) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
  })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  const order: string[] = []
  const onPreview = vi.fn(), onCommit = vi.fn(), onCancel = vi.fn(), onLoneClick = vi.fn()
  const onBegin = vi.fn(() => order.push('begin'))
  let drag!: ReturnType<typeof useKeyframeDrag>
  const timeline = { ...newTimeline(), id: 'intro', durationMs: 1000 }
  function Capture() {
    drag = useKeyframeDrag({
      timeline, frameRate: 30, settings: { ...DEFAULT_TIMELINE_SETTINGS, snapEnabled, snapToKeyframes: true },
      clientXToMs: x => x, durationMs: 1000,
      onBegin, onPreview, onCommit, onCancel, onLoneClick,
    })
    return null
  }
  // Server rendering provides real React refs/callbacks without a DOM package;
  // these tests observe the hook's transaction callbacks and native listeners.
  renderToString(createElement(Capture))
  const target = { focus: vi.fn(() => order.push('focus')), setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() }
  const leader: DragSnapshot = { kfId: 'k1', timelineId: 'intro', trackTarget: 'layers.box.opacity', originalMs: 100 }
  const start = () => drag.beginDrag({ button: 0, pointerId: 1, currentTarget: target, preventDefault: vi.fn(), stopPropagation: vi.fn() } as never, leader, [leader])
  const emit = (type: string, data: Record<string, unknown>) => listeners.get(type)?.(data as unknown as Event)
  const frame = () => { const pending = Array.from(frames.values()); frames.clear(); pending.forEach(callback => callback(16)) }
  return { start, emit, frame, frames, listeners, onPreview, onCommit, onCancel, onLoneClick, order, target }
}

describe('keyframe drag event integration', () => {
  it('takes keyboard focus before the transaction and selects a lone click exactly once', () => {
    const h = harness()
    h.start()
    expect(h.order).toEqual(['focus', 'begin'])
    expect(h.target.focus).toHaveBeenCalledWith({ preventScroll: true })
    h.emit('pointerup', { shiftKey: false })
    expect(h.onLoneClick).toHaveBeenCalledExactlyOnceWith('k1', false)
    expect(h.onCommit).not.toHaveBeenCalled()
  })
  it('previews and commits the latest move and respects disabled snapping', () => {
    const h = harness(false)
    h.start()
    h.emit('pointermove', { clientX: 110, metaKey: false, ctrlKey: false })
    h.emit('pointermove', { clientX: 997, metaKey: false, ctrlKey: false })
    h.frame()
    expect(h.onPreview).toHaveBeenLastCalledWith({ k1: 997 }) // no snap to 1000
    h.emit('pointerup', { shiftKey: false })
    expect(h.onCommit).toHaveBeenCalledWith([expect.objectContaining({ timelineId: 'intro', kfId: 'k1', toMs: 997 })])
    expect(h.listeners.size).toBe(0)
  })

  it('flushes a final queued move before committing on pointerup', () => {
    const h = harness()
    h.start()
    h.emit('pointermove', { clientX: 200 })
    h.emit('pointermove', { clientX: 250 })
    h.emit('pointerup', { shiftKey: false })
    expect(h.onPreview).toHaveBeenLastCalledWith({ k1: 250 })
    expect(h.onCommit).toHaveBeenCalledWith([expect.objectContaining({ toMs: 250 })])
    expect(h.frames.size).toBe(0)
  })

  it('cancels queued previews and removes listeners on pointercancel or Escape', () => {
    const h = harness()
    h.start()
    h.emit('pointermove', { clientX: 300 })
    h.emit('pointercancel', {})
    h.frame()
    expect(h.onCancel).toHaveBeenCalledTimes(1)
    expect(h.onPreview).not.toHaveBeenCalled()
    expect(h.onCommit).not.toHaveBeenCalled()
    expect(h.listeners.size).toBe(0)
    h.start()
    h.emit('pointermove', { clientX: 400 })
    h.emit('keydown', { key: 'Escape', preventDefault: vi.fn() })
    h.frame()
    expect(h.onCancel).toHaveBeenCalledTimes(2)
    expect(h.onPreview).not.toHaveBeenCalled()
    expect(h.listeners.size).toBe(0)
  })
})
