import { describe, expect, it, vi } from 'vitest'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import type { ChronoScene } from '@/lib/types'
import type { MoveState } from '../../types/canvasDragTypes'
import { CanvasDragSession } from './CanvasDragSession'
import type { CanvasPointerSample } from './dragTypes'

function sample(x: number, pointerId = 7): CanvasPointerSample {
  return { pointerId, clientX: x, clientY: 0, shiftKey: false, ctrlKey: false, metaKey: false }
}

function harness(cloneMode?: 'copy') {
  const layer = newRectLayer()
  layer.transform = { ...layer.transform, x: 0, y: 0 }
  const base = { ...emptyScene(), layers: [layer] }
  let scene: ChronoScene = base, active = true, signal = new AbortController()
  const events = new EventTarget(), capture = new EventTarget()
  const release = vi.fn(), clear = vi.fn(), warning = vi.fn(), history: ChronoScene[] = []
  Object.assign(capture, { isConnected: true, setPointerCapture: vi.fn(), releasePointerCapture: release })
  const cancel = vi.fn((options?: { preserveScene?: boolean }) => { active = false; if (!options?.preserveScene) scene = base })
  const editor = { scene: base, getScene: () => scene, getDocumentSignal: () => signal.signal,
    isTransactionActive: () => active, previewTransaction: (next: ChronoScene) => { scene = next }, cancelTransaction: cancel,
  } as unknown as EditorStateReturn
  const drag: MoveState = { kind: 'move', layerId: layer.id, originalLayer: layer,
    movingLayers: [{ id: layer.id, originalLayer: layer, baseX: 0, baseY: 0 }],
    startClientX: 0, startClientY: 0, width: 100, height: 100, cloneMode }
  const commit = vi.fn((_snapshot, preview) => { history.push(base); scene = preview.scene; active = false })
  const previews: ChronoScene[] = []
  const session = new CanvasDragSession(drag, {
    getEditor: () => editor, eventTarget: events as unknown as Window,
    preview: (snapshot, event) => {
      previews.push(snapshot)
      const next = { ...layer, transform: { ...layer.transform, x: event.clientX } }
      return { scene: { ...snapshot, layers: [next] },
        changes: event.clientX ? [{ prev: layer, next, changedProperties: ['transform.x'] }] : [],
        overrides: new Map(), guides: [] }
    }, show: vi.fn(), commit, clear, warning,
  }, { pointerId: 7, currentTarget: capture as unknown as Element })
  const emit = (target: EventTarget, type: string, fields = {}) => target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), fields))
  return { session, editor, base, capture, events, clear, warning, release, cancel, commit, history, previews,
    getScene: () => scene, externalEdit: () => { scene = { ...scene, composition: { ...scene.composition, width: 999 } } },
    emit, replaceDocument: () => { const old = signal; signal = new AbortController(); old.abort(); scene = emptyScene(); active = false } }
}

describe('canvas pointer transaction ownership', () => {
  it('samples pointer-up synchronously against the immutable baseline despite a stale React scene', () => {
    const h = harness()
    h.session.sample(sample(10)); h.session.sample(sample(20)); h.session.finish(sample(35))
    expect(h.editor.scene.layers[0].transform.x).toBe(0)
    expect(h.getScene().layers[0].transform.x).toBe(35)
    expect(h.previews).toEqual([h.base, h.base, h.base])
    expect(h.commit).toHaveBeenCalledTimes(1)
    expect(h.history).toEqual([h.base])
    expect(h.release).toHaveBeenCalledWith(7)
    h.emit(h.events, 'pointerup', sample(90))
    expect(h.commit).toHaveBeenCalledTimes(1)
  })

  it('ignores another pointer and cancels a click or returned-to-start without history', () => {
    const h = harness()
    h.session.sample(sample(100, 8)); h.session.finish(sample(100, 8))
    expect(h.getScene()).toBe(h.base)
    h.session.sample(sample(20)); h.session.finish(sample(0))
    expect(h.getScene()).toBe(h.base)
    expect(h.commit).not.toHaveBeenCalled()
    expect(h.cancel).toHaveBeenCalledTimes(1)
  })

  it.each(['pointercancel', 'lostpointercapture', 'blur', 'Escape', 'unmount'])('restores our preview on %s and detaches listeners', kind => {
    const h = harness()
    h.session.sample(sample(20))
    if (kind === 'lostpointercapture') Object.assign(h.capture, { isConnected: false })
    if (kind === 'Escape') h.emit(h.events, 'keydown', { key: 'Escape' })
    else if (kind === 'unmount') h.session.cancel()
    else h.emit(kind === 'lostpointercapture' ? h.capture : h.events, kind, sample(20))
    expect(h.getScene()).toBe(h.base)
    expect(h.commit).not.toHaveBeenCalled()
    expect(h.clear).toHaveBeenCalledTimes(1)
    h.emit(h.events, 'pointermove', sample(100))
    expect(h.getScene()).toBe(h.base)
  })

  it('retains a valid first drag through connected capture loss and commits only at real up', () => {
    const h = harness()
    h.emit(h.events, 'pointermove', { ...sample(20), buttons: 1 })
    h.emit(h.capture, 'lostpointercapture', { ...sample(20), buttons: 0 })
    expect(h.getScene().layers[0].transform.x).toBe(20)
    expect(h.cancel).not.toHaveBeenCalled()
    expect(h.commit).not.toHaveBeenCalled()
    h.emit(h.events, 'pointermove', { ...sample(35), buttons: 1 })
    h.emit(h.events, 'pointerup', { ...sample(40), buttons: 0 })
    expect(h.getScene().layers[0].transform.x).toBe(40)
    expect(h.history).toEqual([h.base])
    expect(h.clear).toHaveBeenCalledOnce()
    h.emit(h.capture, 'lostpointercapture', sample(40))
    h.emit(h.events, 'pointerup', sample(90))
    expect(h.commit).toHaveBeenCalledOnce()
  })

  it('preserves an external edit when the source changes during the gesture', () => {
    const h = harness()
    h.session.sample(sample(20)); h.externalEdit(); h.session.finish(sample(30))
    expect(h.getScene().composition.width).toBe(999)
    expect(h.cancel).toHaveBeenCalledWith({ preserveScene: true })
    expect(h.commit).not.toHaveBeenCalled()
    expect(h.warning).toHaveBeenCalledTimes(1)
  })

  it('never restores an obsolete scene after document replacement', () => {
    const h = harness()
    h.session.sample(sample(20)); h.replaceDocument(); h.session.finish(sample(30))
    expect(h.getScene().layers).toEqual([])
    expect(h.cancel).not.toHaveBeenCalled()
    expect(h.clear).toHaveBeenCalledTimes(1)
  })

  it('requires an actual drag before committing a copy gesture', () => {
    const h = harness('copy')
    h.session.finish(sample(2))
    expect(h.getScene()).toBe(h.base)
    expect(h.commit).not.toHaveBeenCalled()
    const moved = harness('copy')
    moved.session.finish(sample(5))
    expect(moved.commit).toHaveBeenCalledTimes(1)
  })

  it('freezes the last pressed source preview when an up was missed, ignoring later hover coordinates', () => {
    const h = harness()
    h.emit(h.events, 'pointermove', { ...sample(20), buttons: 1, pointerType: 'mouse' })
    h.emit(h.events, 'pointermove', { ...sample(300), buttons: 0, pointerType: 'mouse' })
    expect(h.getScene().layers[0].transform.x).toBe(20)
    expect(h.history).toEqual([h.base])
    expect(h.clear).toHaveBeenCalledOnce()
    h.emit(h.events, 'pointerup', { ...sample(400), buttons: 0 })
    expect(h.getScene().layers[0].transform.x).toBe(20)
    expect(h.commit).toHaveBeenCalledOnce()
  })

  it('does not promote an undersized clone drag using the later unpressed hover distance', () => {
    const h = harness('copy')
    h.emit(h.events, 'pointermove', { ...sample(2), buttons: 1, pointerType: 'mouse' })
    h.emit(h.events, 'pointermove', { ...sample(300), buttons: 0, pointerType: 'mouse' })
    expect(h.getScene()).toBe(h.base)
    expect(h.commit).not.toHaveBeenCalled()
    expect(h.history).toEqual([])
  })

  it('rolls back a rejected animation commit and releases its capture', () => {
    const h = harness()
    h.commit.mockImplementation(() => { throw new Error('Bake the driven channel first.') })
    h.session.finish(sample(20))
    expect(h.getScene()).toBe(h.base)
    expect(h.warning).toHaveBeenCalledWith('Bake the driven channel first.')
    expect(h.release).toHaveBeenCalledWith(7)
    expect(h.clear).toHaveBeenCalledTimes(1)
  })
})
