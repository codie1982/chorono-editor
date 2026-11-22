import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../defaults'
import { evaluateTrack } from '../evaluator'
import { navigateTimeline } from '../timeline/authoring/timelineNavigation'
import { assertScene } from '../mcp/protocol'
import { ActionRegistry } from '../ai/ActionRegistry'
import { registerCompositionActions } from '../ai/actions/composition'
import { makeUpdateCompositionCmd } from './commands-composition'

/** Millisecond-authored, editable source with an independent looping Timeline. */
function fixture() {
  const hero = { ...newRectLayer(), id: 'hero' }, scene = emptyScene()
  scene.composition = { ...scene.composition, durationMs: 2000, frameRate: 30, audioVolume: 0.7 }
  scene.layers = [hero]
  scene.timelines = [{ ...newTimeline(), id: 'main', durationMs: 2000, loop: false, autoplay: false,
    workAreaInMs: 200, workAreaOutMs: 1800, markers: [{ id: 'note', timeMs: 1500, label: 'Keep me', color: '#fff' }],
    tracks: [{ target: 'layers.hero.transform.x', keyframes: [
      { id: 'manual-start', timeMs: 0, value: 0, easing: { type: 'linear' } },
      { id: 'manual-end', timeMs: 1000, value: 1000, easing: { type: 'easeOut' }, tangentMode: 'broken' },
    ] }] }, { ...newTimeline(), id: 'other', durationMs: 400, loop: true, autoplay: false }]
  return scene
}

describe('composition / active Timeline timing', () => {
  it('updates only the active duration and composition together, with exact undo/redo and portable output', () => {
    const source = fixture(), saved = structuredClone(source)
    const command = makeUpdateCompositionCmd({ ...source.composition, durationMs: 12500, frameRate: 29.97 }, { timelineId: 'main' })
    const after = command.execute(source)
    expect(after.composition).toEqual({ ...source.composition, durationMs: 12500, frameRate: 29.97 })
    expect(after.timelines[0]).toEqual({ ...source.timelines[0], durationMs: 12500 })
    expect(after.timelines[0].tracks).toBe(source.timelines[0].tracks)
    expect(after.timelines[0].markers).toBe(source.timelines[0].markers)
    expect(after.timelines[1]).toBe(source.timelines[1])
    expect(after.layers).toBe(source.layers)
    expect(source).toEqual(saved)
    const loaded = JSON.parse(JSON.stringify(after)); assertScene(loaded)
    expect(loaded).toEqual(after)
    expect(command.undo(after)).toBe(source)
    expect(command.execute(command.undo(after))).toEqual(after)
  })

  it('preserves keys/work areas beyond a shortened duration and restores their poses on extension', () => {
    const source = fixture()
    const shorter = makeUpdateCompositionCmd({ ...source.composition, durationMs: 250 }, { timelineId: 'main' }).execute(source)
    expect(shorter.timelines[0]).toEqual({ ...source.timelines[0], durationMs: 250 })
    assertScene(shorter)
    const longer = makeUpdateCompositionCmd(source.composition, { timelineId: 'main' }).execute(shorter)
    expect(longer).toEqual(source)
    expect(evaluateTrack(longer.timelines[0].tracks[0], 1000)).toBe(1000)
    expect(makeUpdateCompositionCmd({ ...source.composition, durationMs: 0 }, { timelineId: 'main' }).execute(source).timelines[0].durationMs).toBe(0)
  })

  it.each([24, 30, 60, 29.97])('samples the same one-second motion at %s FPS without rescaling keys', fps => {
    const source = fixture()
    source.timelines[0] = { ...source.timelines[0], durationMs: 1500 }
    const after = makeUpdateCompositionCmd({ ...source.composition, frameRate: fps }, { timelineId: 'main' }).execute(source)
    // A frame-rate edit alone must retain even an intentionally different duration.
    expect(after.timelines).toBe(source.timelines)
    const track = after.timelines[0].tracks[0]
    for (const ms of [0, 250, 500, 750, 1000]) expect(evaluateTrack(track, ms)).toBeCloseTo(ms, 8)
    const step = navigateTimeline(after, 'main', 0, 'nextFrame', new Set())
    expect(step).toBeCloseTo(1000 / fps)
    expect(evaluateTrack(track, step)).toBeCloseTo(1000 / fps)
    expect(navigateTimeline(after, 'main', 500, 'nextFrame', new Set()) - 500).toBeCloseTo(1000 / fps)
    expect(track.keyframes).toBe(source.timelines[0].tracks[0].keyframes)
  })

  it('leaves legacy AI/MCP metadata-only composition updates compatible', () => {
    const registry = new ActionRegistry(); registerCompositionActions(registry)
    const source = fixture(), command = registry.get('update_composition')!.toCommand!({ durationMs: 5000, frameRate: 60 }, source)!
    const after = command.execute(source)
    expect(after.composition.durationMs).toBe(5000)
    expect(after.timelines).toBe(source.timelines)
    expect(command.undo(after)).toBe(source)
  })

  it('supports an empty scene without making a Timeline implicitly', () => {
    const source = emptyScene(); source.timelines = []
    const after = makeUpdateCompositionCmd({ ...source.composition, durationMs: 10000 }).execute(source)
    expect(after.timelines).toBe(source.timelines)
  })

  it('rejects invalid settings or a deleted explicit target without modifying source', () => {
    const source = fixture(), saved = structuredClone(source)
    expect(() => makeUpdateCompositionCmd({ ...source.composition, frameRate: 0 }).execute(source)).toThrow('Invalid composition')
    expect(() => makeUpdateCompositionCmd({ ...source.composition, durationMs: 5000 }, { timelineId: 'deleted' }).execute(source)).toThrow('no longer exists')
    expect(source).toEqual(saved)
  })
})
