import { describe, expect, it } from 'vitest'
import { runSafeScript } from '../sandbox'
import { emptyScene, newRectLayer } from '../../defaults'
import { createSceneAPI } from '../../script/api/SceneAPI'
import type { EditorCommand } from '../../editor/commands-keyframe'

function fixture() {
  const scene = emptyScene()
  const hero = newRectLayer()
  hero.id = 'hero'
  hero.style = { ...hero.style, stroke: { color: '#123456', width: 3, opacity: 0.7 } }
  hero.effectsChain = []
  scene.layers = [hero]
  scene.assets = [{ id: 'sound', type: 'audio', name: 'Voice.wav', url: 'blob:voice', durationMs: 10000 }]
  scene.assetCollections = [{ id: 'folder', name: 'Sounds', assetIds: ['sound'] }]
  scene.initialState = { custom: { mode: 'idle' } }
  return scene
}

describe('script-first authoring surface', () => {
  it('exposes complete detached JSON reads without letting copies mutate scene state', async () => {
    const scene = fixture()
    const result = await runSafeScript(`
      const snapshot=scene.snapshot(); snapshot.layers[0].transform.x=9999;
      scene.assets[0].name='Changed'; scene.assetCollections[0].assetIds.length=0;
      scene.initialState.custom.mode='changed';
      const hero=scene.get('hero'), data=hero.data; data.style.stroke.width=99;
      const stroke=hero.get('style.stroke'); stroke.color='#ffffff';
      scene.log(hero.get('style.stroke.width'), hero.get('missing.path'), scene.snapshot().assets[0].name,
        scene.parameters.length,scene.triggers.length,scene.bindings.length,scene.parameterWires.length,scene.stateMachines.length);
    `, scene)
    expect(result.commandCount).toBe(0)
    expect(result.scene).toEqual(scene)
    expect(result.logs).toEqual(['3 null Voice.wav 0 0 0 0 0'])
  })

  it('deep-merges nested layer edits, replaces arrays, and preserves the explicit shallow set contract', async () => {
    const scene = fixture()
    const mask = { ...newRectLayer(), id: 'mask' }
    scene.layers.push(mask)
    scene.layers[0].masks = [{ id: 'mask_ref', maskLayerId: mask.id, mode: 'add' }]
    const result = await runSafeScript(`
      const hero=scene.get('hero');
      hero.patch({transform:{x:321},style:{fill:{color:'#ff0000'}},masks:[]});
      scene.log(hero.get('transform.y'), hero.get('style.stroke.width'));
      hero.set({style:{fill:{type:'solid',color:'#00ff00',opacity:1}}});
    `, scene)
    expect(result.scene.layers[0].transform).toEqual({ ...scene.layers[0].transform, x: 321 })
    expect(result.logs).toEqual([`${scene.layers[0].transform.y} 3`])
    expect(result.scene.layers[0].style?.stroke).toBeUndefined()
    expect(result.scene.layers[0].masks).toEqual([])
    expect(scene.layers[0].masks).toHaveLength(1)
    expect(scene.layers[0].style?.stroke?.width).toBe(3)
  })

  it('copies the active animation for clone/array and permits an explicit timeline override', async () => {
    const result = await runSafeScript(`
      const a=scene.createTimeline({id:'a',durationMs:1000}), b=scene.createTimeline({id:'b',durationMs:1000});
      const hero=scene.get('hero'); a.key(hero,'transform.x',0,11); b.key(hero,'transform.x',0,99);
      scene.useTimeline('b');
      const copy=scene.clone(hero,1)[0];
      const array=scene.array(hero,{pattern:'linear',count:2});
      const explicit=scene.clone(hero,1,{timelineId:'a'})[0];
      const explicitArray=scene.array(hero,{pattern:'linear',count:2},{timelineId:'a'});
      scene.log(JSON.stringify({copy:copy.id,array:array.map(l=>l.id),explicit:explicit.id,explicitArray:explicitArray.map(l=>l.id)}));
    `, fixture())
    const ids = JSON.parse(result.logs[0])
    const a = result.scene.timelines.find(timeline => timeline.id === 'a')!
    const b = result.scene.timelines.find(timeline => timeline.id === 'b')!
    for (const id of [ids.copy, ...ids.array]) {
      expect(b.tracks.find(track => track.target === `layers.${id}.transform.x`)?.keyframes[0].value).toBe(99)
      expect(a.tracks.some(track => track.target.startsWith(`layers.${id}.`))).toBe(false)
    }
    for (const id of [ids.explicit, ...ids.explicitArray]) expect(a.tracks.find(track => track.target === `layers.${id}.transform.x`)?.keyframes[0].value).toBe(11)
  })

  it('reopens a state machine across script runs and edits complete states and transitions', async () => {
    const created = await runSafeScript(`
      scene.createTimeline({id:'idle'}); scene.createTimeline({id:'active'});
      const machine=scene.addStateMachine('States');
      machine.addState('Idle','idle',{id:'idle_state',x:12,y:34,entryActions:[{type:'emitEvent',event:'ready'}]});
      machine.addState('Active','active',{id:'active_state'});
      machine.addTransition('idle_state','active_state','go',{id:'go',blendMs:80});
    `, fixture())
    const edited = await runSafeScript(`
      const machine=scene.stateMachine(scene.stateMachines[0].id);
      machine.data.name='Cannot mutate';
      machine.set({name:'Updated'}).updateState('idle_state',{speed:2,exitActions:[{type:'emitEvent',event:'left'}]})
        .updateTransition('go',{blendMs:120,priority:3});
      machine.addTransition('*','idle_state','reset',{id:'reset'}).removeTransition('reset');
    `, created.scene)
    expect(edited.scene.stateMachines![0]).toMatchObject({ name: 'Updated', initialStateId: 'idle_state',
      states: [{ id: 'idle_state', speed: 2, x: 12, y: 34, entryActions: [{ event: 'ready' }], exitActions: [{ event: 'left' }] }, { id: 'active_state' }],
      transitions: [{ id: 'go', blendMs: 120, priority: 3 }] })
    const removed = await runSafeScript(`scene.stateMachine(scene.stateMachines[0].id).removeState('idle_state')`, edited.scene)
    expect(removed.scene.stateMachines![0]).toMatchObject({ initialStateId: 'active_state', states: [{ id: 'active_state' }], transitions: [] })
    const deleted = await runSafeScript(`scene.stateMachine(scene.stateMachines[0].id).remove()`, removed.scene)
    expect(deleted.scene.stateMachines).toEqual([])
  })

  it('supports entity convenience CRUD with returned ids and one-command undo', () => {
    const initial = fixture()
    let working = initial
    const commands: EditorCommand[] = []
    const api = createSceneAPI({ getScene: () => working, applyCommand: command => { commands.push(command); working = command.execute(working) } }, () => {})
    api.addParam('speed', 1)
    api.updateParam('speed', { name: 'Playback speed', min: 0, max: 4 })
    const trigger = api.addTrigger('click', 'setParam', { layerId: 'hero', paramId: 'speed', paramValue: 2 })
    api.updateTrigger(trigger, { label: 'Updated trigger' })
    const wire = api.wire('transform.x', 'transform.y', 'v*2', { sourceLayerId: 'hero', targetLayerId: 'hero' })
    api.updateWire(wire, { enabled: false })
    api.addBinding({ id: 'binding', source: { type: 'parameter', paramId: 'speed' }, target: { type: 'layerProperty', layerId: 'hero', property: 'opacity' },
      map: { inputMin: 0, inputMax: 4, outputMin: 0, outputMax: 1 } })
    api.updateBinding('binding', { map: { inputMin: 0, inputMax: 2, outputMin: 0, outputMax: 1 } })
    expect(api.parameters[0]).toMatchObject({ name: 'Playback speed' })
    expect(api.triggers[0].label).toBe('Updated trigger')
    expect(api.parameterWires[0].enabled).toBe(false)
    expect(api.bindings[0].map.inputMax).toBe(2)
    api.removeBinding('binding'); api.removeWire(wire); api.removeTrigger(trigger); api.removeParam('speed')
    api.setInitialState({ finished: true })
    for (const command of [...commands].reverse()) working = command.undo(working)
    expect(working).toEqual(initial)
  })

  it('restores initial state and transition order when a state deletion is undone', () => {
    let working = fixture()
    const commands: EditorCommand[] = []
    const api = createSceneAPI({ getScene: () => working, applyCommand: command => { commands.push(command); working = command.execute(working) } }, () => {})
    api.createTimeline({ id: 'one' }); api.createTimeline({ id: 'two' })
    const machine = api.addStateMachine('Graph')
    machine.addState('One', 'one', { id: 'first' }); machine.addState('Two', 'two', { id: 'second' })
    machine.addTransition('first', 'second', 'go', { id: 'go' }).addTransition('*', 'first', 'reset', { id: 'reset' })
    const before = working
    machine.removeState('first')
    const command = commands[commands.length - 1]
    expect(working.stateMachines![0]).toMatchObject({ initialStateId: 'second', transitions: [] })
    working = command.undo(working)
    expect(working).toBe(before)
    expect(machine.data.transitions.map(edge => edge.id)).toEqual(['go', 'reset'])
    working = command.execute(working)
    expect(machine.data.initialStateId).toBe('second')
  })

  it('routes entity CRUD and initial-state replacement through the isolated facade', async () => {
    const result = await runSafeScript(`
      scene.addParam('speed',1); scene.updateParam('speed',{name:'Rate'});
      const trigger=scene.addTrigger('click','setParam',{layerId:'hero',paramId:'speed',paramValue:2});
      scene.updateTrigger(trigger,{label:'Click rate'});
      const wire=scene.wire('transform.x','transform.y','v',{sourceLayerId:'hero',targetLayerId:'hero'});
      scene.updateWire(wire,{enabled:false});
      scene.addBinding({id:'binding',source:{type:'parameter',paramId:'speed'},target:{type:'layerProperty',layerId:'hero',property:'opacity'},map:{inputMin:0,inputMax:1,outputMin:0,outputMax:1}});
      scene.updateBinding('binding',{map:{inputMin:0,inputMax:2,outputMin:0,outputMax:1}});
      scene.log(scene.parameters[0].name,scene.triggers[0].label,scene.parameterWires[0].enabled,scene.bindings[0].map.inputMax);
      scene.removeBinding('binding');scene.removeWire(wire);scene.removeTrigger(trigger);scene.removeParam('speed');
      scene.editEntity('parameters','add','raw',{type:'number',name:'Raw',defaultValue:4});
      scene.editEntity('parameters','update','raw',{defaultValue:5});
      scene.setInitialState({answer:scene.parameters[0].defaultValue});
      scene.editEntity('parameters','remove','raw');
    `, fixture())
    expect(result.logs).toEqual(['Rate Click rate false 2'])
    expect(result.scene).toMatchObject({ parameters: [], triggers: [], bindings: [], parameterWires: [], initialState: { answer: 5 } })
  })

  it('uses native audio placement, trim, split, gain and fade commands inside scripts', async () => {
    const result = await runSafeScript(`
      scene.createTimeline({id:'soundtrack',durationMs:1000});scene.useTimeline('soundtrack');
      const voice=scene.audioClip('sound',{layerId:'voice',startMs:500});
      voice.audioGain(-6.020599913279624).audioFades({fadeInMs:1000,fadeOutMs:500});
      voice.trimAudio({startMs:1500,endMs:9000});
      const right=voice.splitAudio(3500,{rightLayerId:'right'});right.moveAudio(0);
      right.audioGain(0,{timeMs:1000});
      scene.log(right.get('audio.assetId'),right.data.audio.startOffsetMs);
    `, fixture())
    const right = result.scene.layers.find(layer => layer.id === 'right')!
    expect(right).toMatchObject({ startMs: 0, endMs: 5500, audio: { assetId: 'sound', volume: 0.5, startOffsetMs: 3000, timelineId: 'soundtrack', fadeRange: { startMs: -2000, endMs: 5500 } } })
    expect(result.scene.timelines[0]).toMatchObject({ layerIds: ['voice', 'right'], tracks: [{ target: 'layers.right.audio.volume', keyframes: [{ timeMs: 1000, value: 1 }] }] })
    expect(result.scene.assets).toHaveLength(1)
    expect(result.logs).toEqual(['sound 3000'])
    await expect(runSafeScript(`scene.get('right').audioGain(3)`, result.scene)).rejects.toThrow(/timeMs/)
  })

  it('rejects unsafe merge paths, identity changes and invalid graph edits atomically', async () => {
    const scene = fixture()
    await expect(runSafeScript(`scene.get('hero').patch({id:'changed'})`, scene)).rejects.toThrow(/id or type/)
    await expect(runSafeScript(`scene.get('hero').get('constructor.constructor')`, scene)).rejects.toThrow(/Unsafe property/)
    await expect(runSafeScript(`scene.get('hero').patch({style:JSON.parse('{"__proto__":{"polluted":true}}')})`, scene)).rejects.toThrow(/Unsafe property/)
    await expect(runSafeScript(`scene.addParam('duplicate',1);scene.addParam('duplicate',2)`, scene)).rejects.toThrow(/unique/)
    await expect(runSafeScript(`scene.createTimeline({id:'a'});const sm=scene.addStateMachine();sm.addState('Bad','missing')`, scene)).rejects.toThrow(/not found/)
    expect(scene.layers).toHaveLength(1)
    expect(scene.parameters).toEqual([])
  })
})
