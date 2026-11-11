import { describe, it, expect } from 'vitest'
import { createChoronoDemo } from './createChoronoDemo'
import { evaluateTrack } from '../../evaluator'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'

describe('first-launch Chorono demo', () => {
  it('is a portable, native, independently owned scene with valid hierarchy and animation targets', () => {
    const scene = createChoronoDemo(), ids = new Set(scene.layers.map(layer => layer.id))
    expect(ids.size).toBe(scene.layers.length)
    expect(scene.assets).toEqual([])
    for (const layer of scene.layers) {
      if (layer.parentId) expect(ids.has(layer.parentId)).toBe(true)
      expect(layer.opacity).toBe(1)
    }
    for (const track of scene.timelines[0].tracks) {
      expect(ids.has(track.target.split('.')[1])).toBe(true)
      expect(track.keyframes.every((key, index, keys) => !index || key.timeMs > keys[index - 1].timeMs)).toBe(true)
    }
    expect(parseSceneJson(JSON.stringify(scene))).toEqual(scene)
    const second = createChoronoDemo()
    second.layers[0].name = 'Changed manually'
    expect(scene.layers[0].name).not.toBe(second.layers[0].name)
  })
  it('uses native keys for visible motion, closing the satellite and diamond loops', () => {
    const scene = createChoronoDemo(), tracks = scene.timelines[0].tracks
    for (const track of tracks.filter(item => item.target.includes('demo_satellite'))) {
      expect(evaluateTrack(track, 0)).toBeCloseTo(evaluateTrack(track, 6000) as number)
      expect(evaluateTrack(track, 1500)).not.toBe(evaluateTrack(track, 0))
    }
    expect(evaluateTrack(tracks[0], 3000)).toBe(225)
    expect(evaluateTrack(tracks[1], 3000)).toBe(1.12)
    expect(scene.timelines[0].autoplay).toBe(false)
  })
})
