import { describe, expect, it } from 'vitest'
import { runSafeScript } from '../sandbox'
import { emptyScene } from '../../defaults'
import { evaluateNumericTrack } from '../../evaluator'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { readFile } from 'node:fs/promises'

describe('sandbox procedural source and editable bake', () => {
  it('runs the maintainer guide example against an existing named layer', async () => {
    const markdown = await readFile('docs/tr/procedural-authoring.md', 'utf8')
    const example = /```js\n([\s\S]*?)```/.exec(markdown)![1]
    const initial = await runSafeScript("const hero=scene.add('rect');hero.set({name:'Hero card'});", emptyScene())
    const result = await runSafeScript(example, initial.scene)
    const timeline = result.scene.timelines.find(item => item.id === 'sine-motion')!
    expect(timeline.layerIds).toContain(initial.scene.layers[0].id)
    expect(evaluateNumericTrack(timeline.tracks[0], 700)).toBeCloseTo(100 + 50 * Math.sin(1.4), 9)
    expect(initial.scene.timelines).toEqual([])
  })
  it('makes a zero-key sine visible through membership, matches sin(2t), then bakes a local window portably', async () => {
    const created = await runSafeScript(`
      const timeline=scene.createTimeline({id:'signal',durationMs:3000,layerIds:[]});
      const card=scene.add('rect');card.set({name:'Manual card · 09:05'});
      timeline.track('layers.'+card.id+'.transform.x',{controller:{type:'waveform',waveform:{shape:'sine',amplitude:50,frequency:1/Math.PI,phase:0,offset:100,duty:.5}}});
      scene.log(card.id);
    `, emptyScene())
    const track = created.scene.timelines[0].tracks[0]
    expect(track.keyframes).toEqual([])
    expect(created.scene.timelines[0].layerIds).toContain(created.scene.layers[0].id)
    for (const time of [0, 17, 500, 1234, 2999]) expect(evaluateNumericTrack(track, time)).toBeCloseTo(100 + 50 * Math.sin(2 * time / 1000), 9)
    const baked = await runSafeScript(`scene.timeline('signal').bake(${JSON.stringify(track.target)},60,0,{startMs:250,endMs:1750})`, created.scene)
    const output = baked.scene.timelines[0].tracks[0]
    expect(output.controller).toBeUndefined(); expect(output.keyframes[0].timeMs).toBe(250)
    expect(output.keyframes.at(-1)?.timeMs).toBe(1750)
    for (const time of [250, 417, 1001, 1750]) expect(Math.abs(evaluateNumericTrack(output, time)! - evaluateNumericTrack(track, time)!)).toBeLessThan(.02)
    expect(parseSceneJson(JSON.stringify(baked.scene), true)).toEqual(baked.scene)
    expect(created.scene.timelines[0].tracks[0]).toBe(track)
  })
  it('rejects invalid bake options without changing the supplied scene', async () => {
    const created = await runSafeScript(`const t=scene.createTimeline({id:'test'}),a=scene.add('rect');t.key(a,'opacity',0,1);`, emptyScene())
    const before = JSON.stringify(created.scene), target = created.scene.timelines[0].tracks[0].target
    await expect(runSafeScript(`scene.timeline('test').bake(${JSON.stringify(target)},0,0)`, created.scene)).rejects.toThrow(/FPS/)
    expect(JSON.stringify(created.scene)).toBe(before)
  })
})
