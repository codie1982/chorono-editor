import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { emptyScene } from '../../defaults'
import { runSafeScript } from '../sandbox'
import { assertScene } from '../protocol'

describe('published skill authoring examples', () => {
  it('creates independent animations, joins them with events and wires a real parameter', async () => {
    const reference = async (name: string) => readFile(path.resolve('skills/chorono/references', name + '.md'), 'utf8')
    const codeBlocks = (text: string) => [...text.matchAll(/```js\n([\s\S]*?)```/g)].map(match => match[1])
    const construction = codeBlocks(await reference('animation'))[0]
    const interactions = codeBlocks(await reference('interaction'))
    const created = await runSafeScript(construction, emptyScene())
    const connected = await runSafeScript(interactions.join('\n'), created.scene)
    assertScene(connected.scene)
    expect(connected.scene.timelines.map(t => t.id)).toEqual(['intro', 'idle', 'outro'])
    expect(connected.scene.timelines[1].tracks[0].modifiers?.[0].type).toBe('sine')
    expect(connected.scene.stateMachines?.[0].states.map(s => s.timelineId)).toEqual(['intro', 'idle', 'outro'])
    expect(connected.scene.stateMachines?.[0].transitions.map(t => t.trigger)).toEqual(['entered', 'dismiss'])
    expect(connected.scene.parameters[0].id).toBe('energy')
    expect(connected.scene.parameterWires?.[0].target.layerId).toBe(connected.scene.layers[0].id)
  })
})
