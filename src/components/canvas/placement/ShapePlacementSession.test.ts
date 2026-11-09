import { describe, expect, it, vi } from 'vitest'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { ChronoScene } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import { ShapePlacementSession } from './ShapePlacementSession'

const sample = (clientX: number, clientY: number, pointerId = 7, shiftKey = false) =>
  ({ clientX, clientY, pointerId, shiftKey, ctrlKey: false, metaKey: false })

/** The real placement geometry/commands/pointer lifecycle with deterministic
 * storage and a scaled, panned canvas rectangle as platform adapters. */
function fixture() {
  const existing = newRectLayer(), template = newRectLayer()
  const base = { ...emptyScene(), layers: [existing] }
  let source: ChronoScene = base, active = true
  const controller = new AbortController(), events = new EventTarget(), capture = new EventTarget()
  const onClose = vi.fn(), onDraft = vi.fn(), onWarning = vi.fn(), release = vi.fn()
  const history: ChronoScene[] = []
  Object.assign(capture, { width: 1000, height: 600, setPointerCapture: vi.fn(), releasePointerCapture: release,
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 500, height: 300 }) })
  const editor = { getScene: () => source, getDocumentSignal: () => controller.signal,
    isTransactionActive: () => active,
    previewTransaction: (next: ChronoScene) => { source = next },
    commitTransaction: (command: EditorCommand) => { history.push(base); source = command.execute(base); active = false },
    cancelTransaction: (options?: { preserveScene?: boolean }) => { active = false; if (!options?.preserveScene) source = base },
  } as unknown as EditorStateReturn
  const session = new ShapePlacementSession({ getEditor: () => editor, template, canvas: capture as unknown as HTMLCanvasElement,
    start: sample(150, 100), eventTarget: events as unknown as Window, onDraft, onClose, onWarning })
  const emit = (type: string, fields: object) => events.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), fields))
  return { base, template, session, onClose, onDraft, onWarning, history, release, emit,
    source: () => source,
    externalEdit: () => { source = { ...source, composition: { ...source.composition, width: 999 } } },
    replace: () => { source = emptyScene(); active = false; controller.abort() } }
}

describe('shape Add placement gesture', () => {
  it('recovers a missing release from the last drawn size rather than the following hover position', () => {
    const h = fixture()
    h.emit('pointermove', { ...sample(250, 175), buttons: 1, pointerType: 'mouse' })
    h.emit('pointermove', { ...sample(500, 500), buttons: 0, pointerType: 'mouse' })
    const created = h.source().layers[1]
    expect(created.size).toEqual({ width: 200, height: 150 })
    expect(h.history).toEqual([h.base])
    expect(h.onClose).toHaveBeenCalledExactlyOnceWith(h.template.id)
    h.emit('pointerup', { ...sample(600, 600), buttons: 0 })
    expect(h.history).toHaveLength(1)
  })

  it('keeps pointer-down and sub-threshold moves free of default-size geometry', () => {
    const h = fixture()
    expect(h.source()).toBe(h.base)
    expect(h.onDraft).not.toHaveBeenCalled()
    h.session.sample(sample(151, 101))
    expect(h.source()).toBe(h.base)
    expect(h.onDraft).toHaveBeenLastCalledWith(null)
    expect(h.history).toEqual([])
    h.session.sample(sample(180, 120))
    expect(h.source().layers).toHaveLength(2)
    h.session.sample(sample(150, 100))
    expect(h.source()).toBe(h.base)
    expect(h.onDraft).toHaveBeenLastCalledWith(null)
    h.session.cancel()
    expect(h.source()).toBe(h.base)
    expect(h.history).toEqual([])
  })

  it('maps the final pointer-up through pan/zoom and adds one immutable layer with one undo baseline', () => {
    const h = fixture()
    h.session.sample(sample(180, 120))
    expect(h.history).toEqual([])
    expect(h.source().layers).toHaveLength(2)
    h.session.finish(sample(250, 175))
    const created = h.source().layers[1]
    expect(created.id).toBe(h.template.id)
    expect(created.size).toEqual({ width: 200, height: 150 })
    expect(created.transform.x).toBe(100)
    expect(created.transform.y).toBe(100)
    expect(h.source().layers[0]).toBe(h.base.layers[0])
    expect(h.source().timelines).toBe(h.base.timelines)
    expect(h.history).toEqual([h.base])
    expect(h.onClose).toHaveBeenCalledExactlyOnceWith(h.template.id)
    expect(h.release).toHaveBeenCalledWith(7)
    h.emit('pointerup', sample(350, 250))
    expect(h.history).toHaveLength(1)
  })

  it('a click keeps default dimensions but replaces the factory fixed position', () => {
    const h = fixture()
    h.session.sample(sample(151, 101))
    expect(h.source()).toBe(h.base)
    h.session.finish(sample(151, 101))
    const created = h.source().layers[1]
    expect(created.size).toEqual(h.template.size)
    expect(created.transform.x).toBe(100)
    expect(created.transform.y).toBe(100)
    expect(h.history).toHaveLength(1)
  })

  it('a pointer-up with no intermediate move commits the drawn size directly', () => {
    const h = fixture()
    h.session.finish(sample(250, 175))
    expect(h.source().layers[1].size).toEqual({ width: 200, height: 150 })
    expect(h.history).toEqual([h.base])
    expect(h.onDraft).toHaveBeenCalledExactlyOnceWith(h.source().layers[1])
  })

  it('normalizes a left/up drag and constrains its final Shift dimensions', () => {
    const h = fixture()
    h.session.finish(sample(110, 80, 7, true))
    const created = h.source().layers[1]
    expect(created.size!.width).toBe(created.size!.height)
    expect(created.transform.x).toBeLessThan(100)
    expect(created.transform.y).toBeLessThan(100)
  })

  it('ignores a foreign pointer and Escape removes the draft without source/history changes', () => {
    const h = fixture()
    h.session.sample(sample(250, 175, 8))
    expect(h.source()).toBe(h.base)
    h.session.sample(sample(250, 175))
    h.emit('keydown', { key: 'Escape' })
    expect(h.source()).toBe(h.base)
    expect(h.history).toEqual([])
    expect(h.onClose).toHaveBeenCalledExactlyOnceWith(undefined)
    h.emit('pointermove', sample(400, 250))
    expect(h.source()).toBe(h.base)
  })

  it('preserves an intervening edit and reports that its stale Add was canceled', () => {
    const h = fixture()
    h.session.sample(sample(250, 175)); h.externalEdit(); h.session.finish(sample(300, 200))
    expect(h.source().composition.width).toBe(999)
    expect(h.history).toEqual([])
    expect(h.onWarning).toHaveBeenCalledOnce()
    expect(h.onClose).toHaveBeenCalledExactlyOnceWith(undefined)
  })

  it('document replacement keeps the replacement and releases the old gesture', () => {
    const h = fixture()
    h.session.sample(sample(250, 175)); h.replace(); h.session.finish(sample(300, 200))
    expect(h.source().layers).toEqual([])
    expect(h.history).toEqual([])
    expect(h.onClose).toHaveBeenCalledExactlyOnceWith(undefined)
    expect(h.release).toHaveBeenCalledWith(7)
  })
})
