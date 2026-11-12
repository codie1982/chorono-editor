import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../../defaults'
import type { Keyframe } from '../../types'
import { applyKeyframeBatch, type KeyTimeMove } from './keyframeBatch'
import { makeBulkMoveKfCmd, makeScaleKeysCmd, makeStaggerKeysCmd, makePasteKfCmd, makeMoveKfCmd, makeBulkDeleteKfCmd, makeDeleteKfCmd } from '../../editor/commands-keyframe'

function fixture() {
  const scene = emptyScene(), timeline = { ...newTimeline(), id: 'tl', durationMs: 1000 }
  const key = (id: string, timeMs: number): Keyframe => ({ id, timeMs, value: timeMs / 1000, easing: { type: 'easeOut' }, tangentMode: 'aligned', segmentModifiers: [] })
  timeline.tracks = [{ target: 'layers.hero.opacity', keyframes: [key('a', 100), key('b', 300), key('c', 900)] }]
  scene.layers = [{ ...newRectLayer(), id: 'hero' }]; scene.timelines = [timeline]
  return scene
}
const move = (kfId: string, fromMs: number, toMs: number): KeyTimeMove => ({ timelineId: 'tl', target: 'layers.hero.opacity', kfId, fromMs, toMs })

describe('one keyframe batch policy', () => {
  it('restores legacy coincident identities exactly when undoing single or bulk deletion', () => {
    const scene = fixture(), track = scene.timelines[0].tracks[0]
    track.keyframes = [...track.keyframes, { ...track.keyframes[0], id: 'legacy-twin', value: 0.8 }]
    const items = track.keyframes.slice(0, 2).map(kf => ({ timelineId: 'tl', target: track.target, kf }))
    for (const command of [makeBulkDeleteKfCmd(items), makeDeleteKfCmd('tl', track.target, track.keyframes[0])]) {
      expect(command.undo(command.execute(scene))).toEqual(scene)
    }
  })
  it('moves a selection simultaneously, preserving spacing, full key payloads and exact undo', () => {
    const scene = fixture(), moves = [move('a', 100, 200), move('b', 300, 400)]
    const command = makeBulkMoveKfCmd(moves), next = command.execute(scene)
    expect(next.timelines[0].tracks[0].keyframes).toEqual(scene.timelines[0].tracks[0].keyframes.map(key => ({ ...key, timeMs: key.id === 'a' ? 200 : key.id === 'b' ? 400 : 900 })))
    expect(next.layers).toBe(scene.layers); expect(command.undo(next)).toEqual(scene)
  })
  it('allows selected-key swaps without intermediate false collisions', () => {
    const scene = fixture(), next = applyKeyframeBatch(scene, { moves: [move('a', 100, 300), move('b', 300, 100)] })
    expect(next.timelines[0].tracks[0].keyframes.map(key => key.id)).toEqual(['b', 'a', 'c'])
  })
  it('rejects an entire edit at collisions; overwrite removes only unedited destinations and undo restores them', () => {
    const scene = fixture(), before = JSON.stringify(scene), moves = [move('a', 100, 300)]
    expect(() => makeBulkMoveKfCmd(moves).execute(scene)).toThrow(/already exists/)
    expect(JSON.stringify(scene)).toBe(before)
    const command = makeBulkMoveKfCmd(moves, { collisionPolicy: 'overwrite' }), next = command.execute(scene)
    expect(next.timelines[0].tracks[0].keyframes.map(key => key.id)).toEqual(['a', 'c'])
    expect(command.undo(next)).toEqual(scene)
    expect(() => makeBulkMoveKfCmd([move('a', 100, 500), move('b', 300, 500)], { collisionPolicy: 'overwrite' }).execute(scene)).toThrow(/Edited keys/)
  })
  for (const toMs of [-1, 1001, NaN, Infinity]) it(`rejects ${toMs} without per-member clamping or source mutation`, () => {
    const scene = fixture(), before = JSON.stringify(scene)
    expect(() => makeBulkMoveKfCmd([move('a', 100, 200), move('b', 300, toMs)]).execute(scene)).toThrow()
    expect(JSON.stringify(scene)).toBe(before)
  })
  it('applies the same rules to scale, stagger, single-cell time editing and paste', () => {
    const scene = fixture(), target = 'layers.hero.opacity'
    expect(() => makeScaleKeysCmd([{ ...move('a', 100, 0) }, { ...move('b', 300, 0) }], 100, 0).execute(scene)).toThrow(/Edited keys/)
    expect(() => makeStaggerKeysCmd([{ ...move('c', 900, 0), index: 1 }], 200, 'forward').execute(scene)).toThrow(/within/)
    expect(() => makeMoveKfCmd('tl', target, 'a', 100, 300).execute(scene)).toThrow(/already exists/)
    const kf = { ...scene.timelines[0].tracks[0].keyframes[0], id: 'paste', timeMs: 300 }
    expect(() => makePasteKfCmd([{ timelineId: 'tl', target, kf }]).execute(scene)).toThrow(/already exists/)
    const command = makePasteKfCmd([{ timelineId: 'tl', target, kf }], { collisionPolicy: 'overwrite' })
    const next = command.execute(scene); expect(command.undo(next)).toEqual(scene)
  })
  it('keeps distinct sub-ms keys and rejects duplicate identities, stale selections and missing tracks', () => {
    const scene = fixture()
    const next = makeBulkMoveKfCmd([move('a', 100, 299.75)]).execute(scene)
    expect(next.timelines[0].tracks[0].keyframes).toHaveLength(3)
    expect(() => makeBulkMoveKfCmd([move('a', 99, 200)]).execute(scene)).toThrow(/selection changed/)
    expect(() => makeBulkMoveKfCmd([move('missing', 100, 200)]).execute(scene)).toThrow(/selection changed/)
    expect(() => makePasteKfCmd([{ timelineId: 'tl', target: 'missing', kf: scene.timelines[0].tracks[0].keyframes[0] }]).execute(scene)).toThrow(/Missing/)
  })
})
