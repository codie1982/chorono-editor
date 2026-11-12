import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { emptyScene } from '../../defaults'
import { evaluateTimelines, evaluateTrack } from '../../evaluator'
import { assertScene } from '../protocol'
import { runSafeScript } from '../sandbox'

describe('documented procedural authoring', () => {
  it('runs the canonical sine example and its optional bake with membership and value parity', async () => {
    const reference = await readFile(path.resolve('skills/chorono/references/animation.md'), 'utf8')
    const blocks = Array.from(reference.matchAll(/```js\n([\s\S]*?)```/g), match => match[1])
    expect(blocks).toHaveLength(2)

    const built = await runSafeScript(blocks[0], emptyScene())
    assertScene(built.scene)
    const hero = built.scene.layers.find(layer => layer.name === 'Hero card')!
    const idle = built.scene.timelines.find(timeline => timeline.id === 'idle')!
    const target = `layers.${hero.id}.transform.y`
    const track = idle.tracks.find(candidate => candidate.target === target)!
    expect(idle.layerIds).toContain(hero.id)
    expect(idle.durationMs).toBeCloseTo(Math.PI * 1000, 10)
    expect(track.controller?.type).toBe('waveform')

    // Include extrema, off-grid times, and the wrap boundary of the actual clock.
    const timestamps = [0, 250, Math.PI * 250, 1000, 1234.5, Math.PI * 500, 2000, Math.PI * 750, 3000, Math.PI * 1000]
    for (const timeMs of timestamps) {
      expect(evaluateTimelines([idle], timeMs).get(target)).toBeCloseTo(200 + 100 * Math.sin(2 * timeMs / 1000), 10)
    }

    const baked = await runSafeScript(blocks[1], built.scene)
    assertScene(baked.scene)
    const bakedIdle = baked.scene.timelines.find(timeline => timeline.id === idle.id)!
    const bakedTrack = bakedIdle.tracks.find(candidate => candidate.target === target)!
    expect(bakedIdle.layerIds).toContain(hero.id)
    expect(bakedTrack.controller).toBeUndefined()
    expect(bakedTrack.keyframes.length).toBeGreaterThan(2)
    expect(bakedTrack.keyframes.length).toBeLessThanOrEqual(200)
    expect(bakedTrack.keyframes.every(key => key.easing.type === 'linear')).toBe(true)
    expect(bakedTrack.keyframes.at(-1)?.timeMs).toBeCloseTo(idle.durationMs, 8)
    expect(evaluateTrack(bakedTrack, idle.durationMs)).toBeCloseTo(200, 10)
    for (const timeMs of timestamps) {
      const value = evaluateTimelines([bakedIdle], timeMs).get(target) as number
      // At 60 fps, linear interpolation of this amplitude/frequency has <0.02 px error.
      expect(Math.abs(value - (200 + 100 * Math.sin(2 * timeMs / 1000)))).toBeLessThan(0.02)
    }
    expect(track.controller?.type).toBe('waveform')
    expect(baked.scene.timelines.filter(timeline => timeline.id !== idle.id)).toEqual(
      built.scene.timelines.filter(timeline => timeline.id !== idle.id),
    )
  })
})
