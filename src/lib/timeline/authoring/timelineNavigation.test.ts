import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../../defaults'
import { authoringTime, navigateTimeline } from './timelineNavigation'

function fixture() {
  const scene = emptyScene(), timeline = { ...newTimeline(), id: 'tl', durationMs: 1000 }
  scene.composition.frameRate = 29.97
  scene.layers = [{ ...newRectLayer(), id: 'parent' }, { ...newRectLayer(), id: 'a', parentId: 'parent' }, { ...newRectLayer(), id: 'b' }, { ...newRectLayer(), id: 'other' }]
  timeline.layerIds = scene.layers.map(layer => layer.id)
  timeline.tracks = ['a', 'b', 'other'].map((id, index) => ({ target: `layers.${id}.opacity`, keyframes: [100.25 + index * 100, 800.75 + index * 10].map((timeMs, i) => ({ id: `${id}-${i}`, timeMs, value: 1, easing: { type: 'linear' as const } })) }))
  scene.timelines = [timeline]; return scene
}
describe('explicit local authoring navigation', () => {
  it('maps global loop/ping-pong playback but keeps terminal manual editing unwrapped', () => {
    const scene = fixture(), timeline = { ...scene.timelines[0], loop: true }
    expect(authoringTime(timeline, 1000, 'local')).toBe(1000)
    expect(authoringTime(timeline, 1000, 'globalPlayback')).toBe(0)
    expect(authoringTime({ ...timeline, pingPong: true }, 1250, 'globalPlayback')).toBe(750)
    expect(authoringTime({ ...timeline, loopCount: 1 }, 3000, 'globalPlayback')).toBe(1000)
    expect(() => authoringTime(timeline, NaN)).toThrow()
  })
  it('uses selected subtree union; without selection searches the active timeline and preserves off-grid times', () => {
    const scene = fixture(), selected = new Set(['parent', 'b'])
    expect(navigateTimeline(scene, 'tl', 0, 'firstKey', selected)).toBe(100.25)
    expect(navigateTimeline(scene, 'tl', 0, 'lastKey', selected)).toBe(810.75)
    expect(navigateTimeline(scene, 'tl', 200.25, 'nextKey', selected)).toBe(800.75)
    expect(navigateTimeline(scene, 'tl', 200.25, 'nextKey', new Set())).toBe(300.25)
    expect(navigateTimeline(scene, 'tl', 100.25, 'previousKey', selected)).toBe(100.25)
  })
  it('steps fractional frames and timeline boundaries independent of playback work area', () => {
    const scene = fixture(); scene.timelines[0].workAreaInMs = 200; scene.timelines[0].workAreaOutMs = 800; scene.timelines[0].loop = true
    expect(navigateTimeline(scene, 'tl', 0, 'nextFrame', new Set())).toBeCloseTo(1000 / 29.97)
    expect(navigateTimeline(scene, 'tl', 990, 'nextFrame', new Set())).toBe(1000)
    expect(navigateTimeline(scene, 'tl', 10, 'previousFrame', new Set())).toBe(0)
    expect(navigateTimeline(scene, 'tl', 500, 'start', new Set())).toBe(0)
    expect(navigateTimeline(scene, 'tl', 500, 'end', new Set())).toBe(1000)
  })
  it('respects membership and refuses to expose foreign audio as key navigation scope', () => {
    const scene = fixture(); scene.timelines[0].layerIds = ['a']
    scene.layers.push({ ...newRectLayer(), id: 'foreign', type: 'audio', audio: { assetId: 'asset', timelineId: 'elsewhere' } })
    scene.timelines[0].tracks.push({ target: 'layers.foreign.audio.volume', keyframes: [{ id: 'foreign-key', timeMs: 999, value: 1, easing: { type: 'linear' } }] })
    expect(navigateTimeline(scene, 'tl', 0, 'lastKey', new Set())).toBe(800.75)
  })
})
