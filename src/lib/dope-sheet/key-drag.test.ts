import { describe, expect, it, vi } from 'vitest'
import type { Keyframe, Timeline, TimelineSettings } from '@/lib/types'
import { DEFAULT_TIMELINE_SETTINGS } from '@/lib/types'
import { emptyScene } from '@/lib/defaults'
import { makeBulkMoveKfCmd } from '@/lib/editor/commands-keyframe'
import { initHistory, pushHistory, undoHistory } from '@/lib/editor/history'
import { collectDopeSheetSnapshots, createDopeSheetDrag, type DopeSheetDragUpdate } from './key-drag'

const key = (id: string, timeMs: number): Keyframe => ({ id, timeMs, value: 1, easing: { type: 'linear' } })
function timeline(): Timeline {
  return { id: 'intro', durationMs: 1000, autoplay: false, loop: false, tracks: [
    { target: 'layers.a.opacity', keyframes: [key('early', 100), key('late', 900)] },
    { target: 'layers.b.transform.x', keyframes: [key('other', 600)] },
  ] }
}
const noSnap = { ...DEFAULT_TIMELINE_SETTINGS, snapEnabled: false }
const snap = (overrides: Partial<TimelineSettings> = {}) => ({ ...noSnap, snapEnabled: true,
  snapToFrame: false, snapToKeyframes: false, snapToMarkers: false, snapToGrid: false, ...overrides })
function fixture(options: { timeline?: Timeline; settings?: TimelineSettings; pixelsPerMs?: number; leaderId?: string; selectedIds?: Set<string> } = {}) {
  const onBegin = vi.fn(), onPreview = vi.fn(), onCommit = vi.fn(), onCancel = vi.fn(), onClick = vi.fn()
  const session = createDopeSheetDrag({ timeline: timeline(), leaderId: 'early', selectedIds: new Set(['early']),
    settings: noSnap, frameRate: 25, pixelsPerMs: 1, gridStepMs: 250, startX: 0,
    onBegin, onPreview, onCommit, onCancel, onClick, ...options })!
  return { session, onBegin, onPreview, onCommit, onCancel, onClick }
}

describe('Dope Sheet keyframe drag session', () => {
  it('converts actual screen movement using the zoom scale', () => {
    const fitted = fixture({ pixelsPerMs: 0.5 })
    const zoomed = fixture({ pixelsPerMs: 2 })
    expect(fitted.session.move(20)!.previewMs.early).toBe(140)
    expect(zoomed.session.move(20)!.previewMs.early).toBe(110)
  })

  it('snaps the grabbed leader and preserves all group spacing', () => {
    const tl = timeline()
    tl.tracks[0].keyframes = [key('early', 100), key('late', 700)]
    tl.tracks[1].keyframes = [key('other', 750)]
    const { session } = fixture({ timeline: tl, leaderId: 'late', selectedIds: new Set(['early', 'late']),
      pixelsPerMs: 0.5, settings: snap({ snapToKeyframes: true }) })
    const update = session.move(24)!
    expect(update.previewMs).toEqual({ early: 150, late: 750 })
    expect(update.snappedTo).toBe(750)
  })

  it('excludes every selected key from snap targets', () => {
    const tl = timeline()
    tl.tracks[0].keyframes = [key('early', 100), key('late', 250)]
    const { session } = fixture({ timeline: tl, selectedIds: new Set(['early', 'late']), settings: snap({ snapToKeyframes: true }) })
    expect(session.move(144)!.previewMs).toEqual({ early: 244, late: 394 })
  })

  it('uses composition frame rate, grid and marker settings independently', () => {
    expect(fixture({ settings: snap({ snapToFrame: true }) }).session.move(66)!.previewMs.early).toBe(160)
    expect(fixture({ settings: snap({ snapToGrid: true }) }).session.move(146)!.previewMs.early).toBe(250)
    const tl = timeline()
    tl.markers = [{ id: 'mark', timeMs: 333, label: 'Beat' }]
    expect(fixture({ timeline: tl, settings: snap({ snapToMarkers: true }) }).session.move(229)!.previewMs.early).toBe(333)
  })

  it('respects master Snap off and temporary Cmd/Ctrl bypass', () => {
    const settings = snap({ snapToFrame: true })
    expect(fixture({ settings: { ...settings, snapEnabled: false } }).session.move(66)!.previewMs.early).toBe(166)
    expect(fixture({ settings }).session.move(66, true)!.previewMs.early).toBe(166)
  })

  it('keeps preview and release inside the exact duration while moving the group together', () => {
    const { session, onCommit } = fixture({ selectedIds: new Set(['early', 'late']) })
    expect(session.move(500)!.previewMs).toEqual({ early: 200, late: 1000 })
    session.finish(900)
    expect(onCommit).toHaveBeenCalledOnce()
    expect(onCommit.mock.calls[0][0].map((move: { toMs: number }) => move.toMs)).toEqual([200, 1000])
    const left = fixture({ selectedIds: new Set(['early', 'late']) })
    expect(left.session.move(-900)!.previewMs).toEqual({ early: 0, late: 800 })
    left.session.finish(-1000)
    expect(left.onCommit.mock.calls[0][0].map((move: { toMs: number }) => move.toMs)).toEqual([0, 800])
  })

  it('uses the final pointer-up position even when its last move event was not delivered', () => {
    const { session, onCommit } = fixture()
    session.move(20)
    session.finish(75)
    expect(onCommit.mock.calls[0][0][0].toMs).toBe(175)
  })

  it('cancels an unmodified click instead of adding an empty undo step', () => {
    const { session, onCommit, onCancel, onClick } = fixture()
    session.finish(1)
    expect(onCommit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('cancel is idempotent and prevents late release from committing after Escape or unmount', () => {
    const { session, onCancel, onCommit } = fixture()
    session.move(75)
    session.cancel()
    session.cancel()
    session.finish(200)
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('previews many times, commits one undo step, and edits only the active timeline', () => {
    const scene = emptyScene()
    scene.timelines = [timeline(), { ...timeline(), id: 'outro', tracks: [
      { target: 'layers.a.opacity', keyframes: [key('outro-key', 200)] },
    ] }]
    let history = initHistory(scene)
    const session = createDopeSheetDrag({ timeline: scene.timelines[0], leaderId: 'early',
      selectedIds: new Set(['early', 'late', 'outro-key']), settings: noSnap, frameRate: 25,
      pixelsPerMs: 1, gridStepMs: 250, startX: 0,
      onBegin() {},
      onPreview(update: DopeSheetDragUpdate) { history = { ...history, present: makeBulkMoveKfCmd(update.moves).execute(scene) } },
      onCommit(moves) { history = pushHistory({ ...history, present: scene }, makeBulkMoveKfCmd(moves).execute(scene)) },
      onCancel() { history = { ...history, present: scene } },
    })!
    session.move(20); session.move(40); session.move(60)
    expect(history.past).toHaveLength(0)
    session.finish(100)
    expect(history.past).toHaveLength(1)
    expect(history.present.timelines[0].tracks[0].keyframes.map(k => k.timeMs)).toEqual([200, 1000])
    expect(history.present.timelines[1]).toBe(scene.timelines[1])
    expect(undoHistory(history).present).toBe(scene)
    expect(collectDopeSheetSnapshots(scene.timelines[0], new Set(['outro-key']))).toEqual([])
  })
})
