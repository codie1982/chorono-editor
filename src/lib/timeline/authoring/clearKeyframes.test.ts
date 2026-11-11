import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../../defaults'
import { prepareClearKeyframes } from './clearKeyframes'
import type { Track } from '../../types'

/** Includes overlapping IDs, descendants, legacy coincident keys and a second
 * timeline to detect accidental prefix, subtree or cross-timeline deletion. */
function fixture() {
  const scene = emptyScene(), key = { id: 'manual', timeMs: 100, value: .4, easing: { type: 'easeOut' as const }, tangentMode: 'aligned' as const }
  scene.layers = ['hero', 'hero-other', 'child'].map(id => ({ ...newRectLayer(), id, ...(id === 'child' ? { parentId: 'hero' } : {}) }))
  const tracks: Track[] = [
    { target: 'layers.hero.opacity', controller: { type: 'keyframe' }, outOfRange: { before: 'constant', after: 'cycle' }, keyframes: [key, { ...key, id: 'legacy-twin' }] },
    { target: 'layers.hero.transform.x', keyframes: [{ ...key, id: 'x', value: 12 }] },
    { target: 'layers.hero-other.opacity', keyframes: [{ ...key, id: 'other' }] },
    { target: 'layers.child.opacity', keyframes: [{ ...key, id: 'child-key' }] },
  ]
  scene.timelines = [{ ...newTimeline(), id: 'active', layerIds: scene.layers.map(layer => layer.id), tracks },
    { ...newTimeline(), id: 'other-timeline', tracks: [tracks[0]] }]
  return scene
}

describe('scoped clear keyframes', () => {
  it('clears only the layer in the active timeline, keeps empty tracks/settings and restores every payload in one undo', () => {
    const scene = fixture(), before = JSON.stringify(scene)
    const plan = prepareClearKeyframes(scene, 'active', { kind: 'layer', layerId: 'hero' })
    expect(plan.keyIds.size).toBe(3)
    const next = plan.command!.execute(scene)
    expect(next.timelines[0].tracks.slice(0, 2).every(track => !track.keyframes.length)).toBe(true)
    expect(next.timelines[0].tracks[0]).toEqual({ ...scene.timelines[0].tracks[0], keyframes: [] })
    expect(next.timelines[0].tracks.slice(2)).toEqual(scene.timelines[0].tracks.slice(2))
    expect(next.timelines[1]).toBe(scene.timelines[1]); expect(next.layers).toBe(scene.layers)
    expect(next.timelines[0].layerIds).toBe(scene.timelines[0].layerIds)
    expect(plan.command!.undo(next)).toEqual(scene); expect(JSON.stringify(scene)).toBe(before)
  })
  it('clears one parameter without changing other channels', () => {
    const scene = fixture(), plan = prepareClearKeyframes(scene, 'active', { kind: 'track', target: 'layers.hero.opacity' })
    const next = plan.command!.execute(scene)
    expect(next.timelines[0].tracks[0].keyframes).toEqual([])
    expect(next.timelines[0].tracks[1]).toBe(scene.timelines[0].tracks[1])
    expect(plan.command!.undo(next)).toEqual(scene)
  })
  for (const flag of ['locked', 'frozen'] as const) it(`respects ${flag} ancestors`, () => {
    const scene = fixture(); scene.layers[0][flag] = true
    const plan = prepareClearKeyframes(scene, 'active', { kind: 'layer', layerId: 'child' })
    expect(plan.command).toBeNull(); expect(plan.reason).toMatch(/Unlock/)
  })
  it('returns no command for missing, empty or non-layer targets', () => {
    const scene = fixture(); scene.timelines[0].tracks[0].keyframes = []
    expect(prepareClearKeyframes(scene, 'active', { kind: 'track', target: 'layers.hero.opacity' }).command).toBeNull()
    expect(prepareClearKeyframes(scene, 'missing', { kind: 'layer', layerId: 'hero' }).command).toBeNull()
    expect(prepareClearKeyframes(scene, 'active', { kind: 'layer', layerId: 'missing' }).command).toBeNull()
    expect(prepareClearKeyframes(scene, 'active', { kind: 'track', target: 'effects.hero.opacity' }).command).toBeNull()
  })
  it('refuses stale plans instead of overwriting later manual keys or locks', () => {
    const scene = fixture(), plan = prepareClearKeyframes(scene, 'active', { kind: 'layer', layerId: 'hero' })
    expect(() => plan.command!.execute({ ...scene, timelines: [...scene.timelines] })).toThrow(/Source changed/)
    expect(() => plan.command!.execute({ ...scene, layers: [...scene.layers] })).toThrow(/Source changed/)
  })
})
