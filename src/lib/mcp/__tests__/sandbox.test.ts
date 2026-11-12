import { describe, it, expect } from 'vitest'
import { runSafeScript } from '../sandbox'
import { emptyScene } from '../../defaults'
import { getToolCatalog, validateToolCall } from '../catalog'
import { assertScene } from '../protocol'

describe('isolated authoring', () => {
  it('creates independent timelines, curves, modifiers, particles and state machines', async () => {
    const result = await runSafeScript(`
      scene.composition({width:1080,height:1920,durationMs:6000});
      const intro=scene.createTimeline({id:'intro',durationMs:2000});
      const ball=scene.add('circle'); ball.set({name:'Hero'}); ball.pos=[100,200];
      intro.key(ball,'transform.x',0,100,{type:'customBezier',bezier:{cx1:.2,cy1:0,cx2:.3,cy2:1}}).key(ball,'transform.x',2000,600);
      const loop=scene.cloneTimeline('intro','loop'); loop.set({loop:true});
      scene.useTimeline('loop'); ball.key('opacity',0,0).key('opacity',1000,1);
      loop.modifier('layers.'+ball.id+'.transform.x',{type:'sine',parameters:{amplitude:20,frequency:1}});
      scene.addEmitter('confetti').configureParticles({emitter:{maxParticles:50}});
      scene.addParam('active',true); const sm=scene.addStateMachine('Hero states');
      const a=sm.addState('Intro','intro'), b=sm.addState('Loop','loop'); sm.addTransition(a,b,'next');
      scene.log(ball.id,scene.timelines.length);
    `, emptyScene())
    expect(result.scene.timelines).toHaveLength(2)
    expect(result.scene.timelines[0].tracks).toHaveLength(1)
    expect(result.scene.timelines[1].tracks).toHaveLength(2)
    expect(result.scene.timelines[0].tracks[0].keyframes[0].easing.type).toBe('customBezier')
    const sourceIds = new Set(result.scene.timelines[0].tracks.flatMap(track => track.keyframes.map(key => key.id)))
    expect(result.scene.timelines[1].tracks.every(track => track.keyframes.every(key => !sourceIds.has(key.id)))).toBe(true)
    expect(result.scene.timelines[1].tracks[0].modifiers![0].type).toBe('sine')
    expect(result.scene.stateMachines![0].states).toHaveLength(2)
    expect(result.logs).toHaveLength(1)
    assertScene(result.scene)
  })
  it('does not expose process, require, network, DOM or host constructors', async () => {
    const result = await runSafeScript(`scene.log(typeof process,typeof require,typeof fetch,typeof document,scene.constructor.constructor('return typeof process')());`, emptyScene())
    expect(result.logs[0]).toBe('undefined undefined undefined undefined undefined')
  })
  it('keeps a timeline referenced by a state machine when deletion is requested', async () => {
    const created = await runSafeScript(`
      scene.createTimeline({id:'idle',durationMs:1000});
      const sm=scene.addStateMachine('Playback states');
      sm.addState('Idle','idle');
    `, emptyScene())
    await expect(runSafeScript(`scene.deleteTimeline('idle')`, created.scene)).rejects.toThrow(/state machine/)
    expect(created.scene.timelines.map(t => t.id)).toEqual(['idle'])
  })
  it('discards scene mutations when a script fails', async () => {
    const scene = emptyScene()
    await expect(runSafeScript(`scene.add('circle');throw new Error('rollback')`, scene)).rejects.toThrow('rollback')
    expect(scene.layers).toHaveLength(0)
  })
  it('interrupts infinite loops and limits the isolated heap', async () => {
    await expect(runSafeScript('while(true){}', emptyScene(), 20)).rejects.toThrow(/interrupt|budget/i)
    await expect(runSafeScript(`const a=Array(10000000).fill('large');scene.log(a.length);`, emptyScene())).rejects.toThrow()
  })
  it('rejects prototype pollution and cyclic parents', async () => {
    await expect(runSafeScript(`scene.add('rect').set({['__'+'proto__']:{polluted:true}})`, emptyScene())).rejects.toThrow(/Unsafe property/)
    await expect(runSafeScript(`const a=scene.add('group'),b=scene.add('group');a.parent(b);b.parent(a);`, emptyScene())).rejects.toThrow(/cyclic/)
    expect(({} as any).polluted).toBeUndefined()
  })
  it('bounds native allocations before clone and spline generation', async () => {
    await expect(runSafeScript(`scene.clone(scene.add('rect'),1000000000)`, emptyScene())).rejects.toThrow(/limit/)
    await expect(runSafeScript(`scene.addSpline('star',{points:1000000000,outerRadius:10,innerRadius:5})`, emptyScene())).rejects.toThrow(/limit/)
    await expect(runSafeScript(`const g=scene.add('group');scene.add('rect').parent(g);scene.add('circle').parent(g);scene.clone(g,3000);`, emptyScene())).rejects.toThrow(/Expanded clone/)
    await expect(runSafeScript(`const r=scene.add('repeater');r.set({repeater:{sourceLayerId:r.id,count:2,mode:'linear'}});`, emptyScene())).rejects.toThrow(/Cyclic/)
  })
})

describe('capabilities and input boundaries', () => {
  it('exposes native and extended tools without duplicate names', async () => {
    const names = (await getToolCatalog('legacy')).map(t => t.name)
    expect(names.length).toBeGreaterThanOrEqual(60)
    for (const name of ['add_layer','create_object','array_layer','add_spline','create_state_machine','add_parameter_wire','set_keyframes','update_track','add_modifier','clone_timeline','run_script','render_preview','save_project','control_runtime']) expect(names).toContain(name)
    expect(new Set(names).size).toBe(names.length)
  })
  it('rejects schema errors and excessive workload sizes', async () => {
    const access = { expectedRevision: 0, readToken: 'a'.repeat(64) }
    await expect(validateToolCall('create_object', access)).rejects.toThrow('Invalid arguments')
    await expect(validateToolCall('array_layer', { layerId: 'a', count: 999999999, ...access })).rejects.toThrow()
    await expect(validateToolCall('run_script', { code: '', extra: true, ...access })).rejects.toThrow()
  })
})
