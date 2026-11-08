import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { emptyScene } from '../../defaults'
import { evaluateTimelines } from '../../evaluator'
import { runSafeScript } from '../sandbox'
import { assertScene } from '../protocol'

describe('published skill authoring examples', () => {
  it('creates independent animations, joins them with events and wires a real parameter', async () => {
    const reference = async (name: string) => readFile(path.resolve('skills/chorono/references', name + '.md'), 'utf8')
    const codeBlocks = (text: string) => Array.from(text.matchAll(/```js\n([\s\S]*?)```/g), match => match[1])
    const construction = codeBlocks(await reference('animation'))[0]
    const interactions = codeBlocks(await reference('interaction'))
    const created = await runSafeScript(construction, emptyScene())
    const connected = await runSafeScript(interactions.join('\n'), created.scene)
    assertScene(connected.scene)
    expect(connected.scene.timelines.map(t => t.id)).toEqual(['intro', 'idle', 'outro'])
    const idle = connected.scene.timelines.find(timeline => timeline.id === 'idle')!
    const hero = connected.scene.layers.find(layer => layer.name === 'Hero card')!
    const target = `layers.${hero.id}.transform.y`
    expect(idle.layerIds).toContain(hero.id)
    expect(idle.tracks.find(track => track.target === target)?.controller).toMatchObject({
      type: 'waveform',
      waveform: { shape: 'sine', amplitude: 100, frequency: 1 / Math.PI, phase: 0, offset: 200 },
    })
    for (const [timeMs, expected] of [[0, 200], [Math.PI * 250, 300], [Math.PI * 750, 100]]) {
      expect(evaluateTimelines([idle], timeMs).get(target)).toBeCloseTo(expected, 8)
    }
    expect(connected.scene.stateMachines?.[0].states.map(s => s.timelineId)).toEqual(['intro', 'idle', 'outro'])
    expect(connected.scene.stateMachines?.[0].transitions.map(t => t.trigger)).toEqual(['entered', 'dismiss'])
    expect(connected.scene.parameters[0].id).toBe('energy')
    expect(connected.scene.parameterWires?.[0].target.layerId).toBe(connected.scene.layers[0].id)
  })
})
