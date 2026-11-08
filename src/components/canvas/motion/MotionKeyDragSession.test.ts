import { describe, expect, it, vi } from 'vitest'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { emptyScene, newRectLayer, newTimeline } from '@/lib/defaults'
import { moveTrajectoryNodes } from '@/lib/timeline/trajectory/commands'
import { MotionKeyDragSession } from './MotionKeyDragSession'
import type { ChronoScene } from '@/lib/types'

/** Native position commands and the real shared pointer lifecycle, with only
 * platform events/editor storage adapted for a deterministic unit environment. */
function fixture() {
  const hero = { ...newRectLayer(), id: 'hero' }, timeline = newTimeline()
  timeline.id = 'motion'; timeline.durationMs = 1000; timeline.loop = false
  timeline.tracks = [
    { target: 'layers.hero.transform.x', keyframes: [{ id: 'x', timeMs: 500, value: 100, easing: { type: 'easeInOut' } }] },
    { target: 'layers.hero.transform.y', keyframes: [{ id: 'y', timeMs: 500, value: 200, easing: { type: 'hold' } }] },
  ]
  const base = { ...emptyScene(), layers: [hero], timelines: [timeline] }
  let source: ChronoScene = base, active = true
  const document = new AbortController(), events = new EventTarget(), capture = new EventTarget()
  const release = vi.fn(), clear = vi.fn(), warning = vi.fn(), history: ChronoScene[] = []
  Object.assign(capture, { setPointerCapture: vi.fn(), releasePointerCapture: release })
  const editor = { getScene: () => source, getDocumentSignal: () => document.signal,
    isTransactionActive: () => active, previewTransaction: (next: ChronoScene) => { source = next },
    cancelTransaction: (options?: { preserveScene?: boolean }) => { active = false; if (!options?.preserveScene) source = base },
  } as unknown as EditorStateReturn
  const session = new MotionKeyDragSession({ startClientX: 0, startClientY: 0 }, {
    getEditor: () => editor, eventTarget: events as unknown as Window,
    preview: (snapshot, sample) => {
      const result = moveTrajectoryNodes(snapshot, { timelineId: timeline.id, layerId: hero.id,
        nodes: [{ timeMs: 500, xKeyId: 'x', yKeyId: 'y' }], deltaWorld: { x: sample.clientX, y: sample.clientY } })
      return { ...result, scene: result.command?.execute(snapshot) ?? snapshot }
    }, show: () => {}, commit: (snapshot, preview) => {
      if (preview.command) { history.push(snapshot); source = preview.command.execute(snapshot); active = false }
    }, clear, warning,
  }, { pointerId: 7, currentTarget: capture as unknown as Element })
  const emit = (type: string, fields: object) => events.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), fields))
  return { base, session, events, capture, clear, release, warning, history, emit,
    source: () => source, active: () => active,
    externalEdit: () => { source = { ...source, composition: { ...source.composition, width: 999 } } } }
}

const sample = (x: number, pointerId = 7) => ({ pointerId, clientX: x, clientY: 0, shiftKey: false, ctrlKey: false, metaKey: false })

describe('motion key pointer policy', () => {
  it('uses the final pointer sample once and preserves native IDs/easing', () => {
    const h = fixture()
    h.session.sample(sample(10)); h.session.finish(sample(35))
    expect(h.source().timelines[0].tracks[0].keyframes[0]).toEqual({ ...h.base.timelines[0].tracks[0].keyframes[0], value: 135 })
    expect(h.source().timelines[0].tracks[1].keyframes[0]).toEqual(h.base.timelines[0].tracks[1].keyframes[0])
    expect(h.source().layers).toEqual(h.base.layers)
    expect(h.history).toEqual([h.base]); expect(h.active()).toBe(false)
    expect(h.clear).toHaveBeenCalledTimes(1); expect(h.release).toHaveBeenCalledWith(7)
    h.emit('pointerup', sample(90)); expect(h.history).toHaveLength(1)
  })

  it('ignores a second pointer and Escape restores source without history or listeners', () => {
    const h = fixture()
    h.session.sample(sample(50, 8)); expect(h.source()).toBe(h.base)
    h.session.sample(sample(20)); h.emit('keydown', { key: 'Escape' })
    expect(h.source()).toBe(h.base); expect(h.history).toEqual([]); expect(h.active()).toBe(false)
    h.emit('pointermove', sample(100)); expect(h.source()).toBe(h.base)
    expect(h.clear).toHaveBeenCalledTimes(1)
  })

  it('does not roll an external source change back over its own stale preview', () => {
    const h = fixture()
    h.session.sample(sample(20)); h.externalEdit(); h.session.finish(sample(40))
    expect(h.source().composition.width).toBe(999); expect(h.history).toEqual([])
    expect(h.warning).toHaveBeenCalled(); expect(h.active()).toBe(false)
  })
})
