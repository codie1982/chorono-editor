import { describe, expect, it, vi } from 'vitest'
import { clipAcceptanceScene } from '../__tests__/clipAcceptanceScene'
import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'
import { prepareRenderFrame } from '../../render/prepareRenderFrame'
import { ChronoPlayer } from '../../player/ChronoPlayer'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { fakeEditor } from '../../mcp/__tests__/support/fakeEditor'
import { ItemDetailSession } from '../../editor/detail/ItemDetailSession'
import { makeKeyframeLayerSnapshotCmd } from '../../editor/commands-keyframe'
import { contentTimelineContext } from '../../timeline/authoring/TimelineAuthoringContext'
import { initHistory, pushHistory, undoHistory, redoHistory } from '../../editor/history'
import '../../registry/bootstrap'

const seeks = [0, 250, 400, 500, 999, 1000, 1250, 1400, 1500, 2000, 2400, 500, 0]

describe('3D-T2 outer box and private clip integration', () => {
  it.each(seeks)('combines outer pose and owner-local clip at %s ms without shared evaluated state', time => {
    const scene = clipAcceptanceScene(), before = JSON.stringify(scene), frame = prepareRenderFrame(scene, time)
    const original = frame.index.get('original')!, copy = frame.index.get('copy')!, instance = frame.index.get('instance')!
    expect(original.transform.x).toBeCloseTo(20 + Math.min(time, 2000) * .04)
    expect(original.transform.rotationDeg).toBeCloseTo(Math.min(time, 2000) * .006)
    expect(original.size!.width).toBeCloseTo(150 + Math.min(time, 2000) * .01)
    expect(original.model3d!.rotation.y).toBeCloseTo((time % 1000) * .06)
    expect(copy.model3d!.rotation.y).toBeCloseTo(60 - Math.min(1000, Math.max(0, time - 250)) * .06)
    expect(instance.model3d!.rotation.y).toBeCloseTo((Math.max(0, time - 400) % 1000) * .06)
    expect(original.model3d!.camera.pitch).toBe(8)
    expect(copy.model3d!.camera.pitch).toBe(time >= 1250 ? 25 : 8)
    expect(instance.size!.width).toBe(150) // Authored source visual, never original's separately evaluated box.
    expect(instance.parentId).toBe('parent'); expect(instance.instanceOf).toBeUndefined()
    expect(frame.index.get('parent')!.transform.x).toBeCloseTo(270 - Math.min(time, 2000) * .01)
    expect(original.model3d).not.toBe(copy.model3d); expect(original.model3d).not.toBe(instance.model3d)
    expect(JSON.stringify(scene)).toBe(before)
  })

  it('player/explicit/renderer preparation agree through backwards scrub and repeated loop boundaries', () => {
    const scene = clipAcceptanceScene(), before = JSON.stringify(scene), player = new ChronoPlayer(scene, null, { loop: false })
    try {
      for (const time of seeks) {
        const live = player.tick(time), explicit = evaluateSceneFrame(scene, time)
        expect(Array.from(live.overrides)).toEqual(Array.from(explicit.overrides))
        // Supplied final overrides are not evaluated for a second private clock.
        expect(prepareRenderFrame(scene, time, live.overrides).overrides).toBe(live.overrides)
      }
    } finally { player.destroy() }
    expect(JSON.stringify(scene)).toBe(before)
  })
  it('explicit sampling creates no per-owner animation loop or source clocks', () => {
    const schedule = vi.fn(), scene = clipAcceptanceScene(), before = JSON.stringify(scene)
    vi.stubGlobal('requestAnimationFrame', schedule)
    const player = new ChronoPlayer(scene, null, { loop: false })
    try {
      for (const time of seeks) player.tick(time)
      expect(schedule).not.toHaveBeenCalled()
      expect(JSON.stringify(scene)).toBe(before)
    } finally { player.destroy(); vi.unstubAllGlobals() }
  })

  it('portable reopen and local clip edit preserve outer/other owners, stable key metadata and one main Undo', () => {
    const scene = parseSceneJson(JSON.stringify(clipAcceptanceScene()), true), before = JSON.stringify(scene)
    const session = new ItemDetailSession(scene, 19, new AbortController().signal, 'original'), content = session.animation!
    const draft = content.initial, context = contentTimelineContext(draft, 'original', 'turn'), owner = draft.layers[0]
    const changed = makeKeyframeLayerSnapshotCmd('turn', { ...owner, model3d: { ...owner.model3d!, rotation: { ...owner.model3d!.rotation, y: 37 } } },
      500, ['model3d.rotation.y'], context).execute(draft)
    const command = session.prepareClipApply(changed, scene, 19, session.document)!, next = command.execute(scene)
    expect(next.timelines).toBe(scene.timelines); expect(next.layers[1]).toBe(scene.layers[1])
    expect(next.layers[3]).toBe(scene.layers[3]); expect(next.layers[0].transform).toBe(scene.layers[0].transform)
    expect(next.layers[0].model3d!.animation!.clips[0].tracks[0].keyframes[0]).toEqual(scene.layers[0].model3d!.animation!.clips[0].tracks[0].keyframes[0])
    const history = pushHistory(initHistory(scene), next)
    expect(history.past).toHaveLength(1); expect(undoHistory(history).present).toBe(scene)
    expect(redoHistory(undoHistory(history)).present).toBe(next)
    const evaluated = evaluateSceneFrame(next, 500).overrides
    expect(evaluated.get('layers.original.model3d.rotation.y')).toBe(37)
    expect(evaluated.get('layers.copy.model3d.rotation.y')).toBe(45)
    // A live instance shares the edited definition, but samples its own 100 ms.
    // The independent copy retains its original definition and pose.
    expect(evaluated.get('layers.instance.model3d.rotation.y')).toBeCloseTo(7.4)
    expect(JSON.stringify(scene)).toBe(before)
    session.close()
  })

  it('real broker evaluate_frame matches the player and leaves revision/source/history unchanged', async () => {
    const scene = clipAcceptanceScene(), snapshot = JSON.stringify(scene), editor = fakeEditor('Model clip T2')
    editor.replaceDocument(scene, 29)
    const player = new ChronoPlayer(scene, null, { loop: false })
    try {
      for (const timeMs of [500, 1000, 1500, 500, 0]) {
        const result = await editor.call('evaluate_frame', { timeMs, timelineIds: ['outer'] })
        expect(result.revision).toBe(29)
        expect(result.values).toEqual(Object.fromEntries(player.tick(timeMs).overrides))
      }
      expect(editor.historyLength()).toBe(0)
      expect(editor.host.editor.getRevision()).toBe(29)
      expect(JSON.stringify(editor.host.editor.getScene())).toBe(snapshot)
    } finally { player.destroy(); await editor.close() }
  })
})
