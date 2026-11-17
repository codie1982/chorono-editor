import { describe, expect, it } from 'vitest'
import { emptyScene, newSplineLayerFromPrimitive } from '../../defaults'
import { createSceneAPI } from '../../script/api/SceneAPI'
import { SplineHandle } from '../../script/api/SplineHandle'
import { LayerHandle } from '../../script/api/LayerHandle'
import { TimelineHandle } from '../../script/api/TimelineHandle'
import { StateMachineHandle } from '../../script/api/StateMachineHandle'
import { ParticleHandle } from '../../script/api/ParticleHandle'
import { ExplorerAPI } from '../../script/api/ExplorerAPI'
import { SPLINE_SCRIPT_SURFACE } from '../../script/api/splineSurface'
import { runSafeScript } from '../sandbox'

/** Compare actual API/proxy shapes without executing the legacy unsandboxed
 * Console. QuickJS alone executes script text; direct host calls exercise the
 * exact createSceneAPI that the manual Console uses. */
function hostAPI() {
  let scene = emptyScene(), writes = 0
  return { api: createSceneAPI({ getScene: () => scene, applyCommand: cmd => { scene = cmd.execute(scene); writes++ } }, () => {}),
    get scene() { return scene }, get writes() { return writes } }
}
const publicNames = (prototype: object, privateNames: string[] = []) => Object.getOwnPropertyNames(prototype).filter(name => !['constructor', ...privateNames].includes(name)).sort()

describe('Script Console / QuickJS feature compatibility', () => {
  it('projects every public scene/handle function and getter into the real QuickJS proxy', async () => {
    const { api } = hostAPI()
    const result = await runSafeScript(`
      scene.createTimeline({id:'audit'});
      const layer=scene.addSpline('line',{x1:0,y1:0,x2:100,y2:0});
      const names=value=>Object.getOwnPropertyNames(Object.getPrototypeOf(value)).filter(n=>n!=='constructor').sort();
      scene.log(JSON.stringify({scene:Object.getOwnPropertyNames(scene).sort(),layer:names(layer),spline:names(layer.spline),
        timeline:names(scene.timeline('audit')),machine:names(scene.addStateMachine('audit')),particles:names(layer.particles),explorer:names(scene.explorer)}));
    `, emptyScene())
    const actual = JSON.parse(result.logs[0])
    expect(actual.scene).toEqual(Object.getOwnPropertyNames(api).sort())
    expect(actual.layer).toEqual(publicNames(LayerHandle.prototype, ['_layer', '_audioTimeline', '_patchTransform', '_write']))
    expect(actual.spline).toEqual([...publicNames(SplineHandle.prototype, ['id', 'layer', 'change', 'point', 'contour', 'segment', 'removeContours', 'parallelContour', 'cornerTreatment']), 'layerId'].sort())
    expect(actual.timeline).toEqual(publicNames(TimelineHandle.prototype))
    expect(actual.machine).toEqual(publicNames(StateMachineHandle.prototype))
    expect(actual.particles).toEqual(publicNames(ParticleHandle.prototype, ['layer', 'commit', 'channel', 'lifeStops']))
    expect(actual.explorer).toEqual(publicNames(ExplorerAPI.prototype, ['read', 'apply', 'moveRelative']))
    expect(actual.spline).toEqual([...SPLINE_SCRIPT_SURFACE.properties, ...SPLINE_SCRIPT_SURFACE.valueMethods, ...SPLINE_SCRIPT_SURFACE.chainMethods, 'layerId'].sort())
  })
  it('exposes explicit selection, append, Continue/Auto Close, paint and transforms through QuickJS', async () => {
    const result = await runSafeScript(`
      const s=scene.addSpline('line',{x1:0,y1:0,x2:100,y2:0}).spline;
      const contour=Object.values(s.data.contours)[0];
      s.edit({kind:'draw',startPointId:contour.pointIds[1],points:[{x:100,y:80}],autoClose:true});
      s.edit({kind:'paint',fill:{type:'none'},stroke:{type:'solid',color:'#ff0000',width:2}});
      const appended=s.edit({kind:'append',primitive:'circle',params:{radius:10},x:200,name:'Satellite'});
      s.edit({kind:'transform',selection:{mode:'object',ids:appended.ids},transform:{x:20}});
      scene.log(JSON.stringify({closed:s.getContour(contour.id).closed,ids:appended.ids}));
    `, emptyScene())
    expect(JSON.parse(result.logs[0]).closed).toBe(true)
    expect(result.scene.layers[0].style).toMatchObject({ fill: { type: 'none' }, stroke: { width: 2 } })
    expect(Object.values(result.scene.layers[0].spline!.subShapes).some(s => s.name === 'Satellite')).toBe(true)
  })
  it('uses the same strict limits in direct Console API and QuickJS without allocating unsupported work', async () => {
    const host = hostAPI(), spline = host.api.addSpline('line', { x1: 0, y1: 0, x2: 100, y2: 0 })!.spline, before = structuredClone(host.scene), writes = host.writes
    for (const operation of [
      { kind: 'append', primitive: 'ngon', params: { radius: 20, sides: 10000000 } },
      { kind: 'paint', fill: { type: 'solid', opacity: 200 } },
      { kind: 'paint', fill: { type: 'none' }, unexpected: true },
      { kind: 'fillet', pointIds: ['missing'], radiusPx: 10 },
    ]) expect(() => spline.edit(operation as any)).toThrow()
    expect(host.scene).toEqual(before); expect(host.writes).toBe(writes)
    await expect(runSafeScript(`scene.addSpline('line',{x1:0,y1:0,x2:100,y2:0}).spline.edit({kind:'paint',fill:{type:'solid',opacity:200}})`, emptyScene())).rejects.toThrow()
  })
  it('synchronizes composition duration only for an explicit timeline, with no key retiming when FPS changes', async () => {
    const result = await runSafeScript(`
      const t=scene.createTimeline({id:'main',durationMs:1000}), l=scene.add('rect');
      t.key(l,'transform.x',0,0).key(l,'transform.x',1000,1000);
      scene.composition({durationMs:2000,frameRate:24});
      if(t.data.durationMs!==1000) throw new Error('Legacy default was retimed');
      scene.composition({durationMs:3000,frameRate:60},{timelineId:'main'});
    `, emptyScene())
    expect(result.scene.timelines[0].durationMs).toBe(3000)
    expect(result.scene.timelines[0].tracks[0].keyframes.map(k => [k.timeMs, k.value])).toEqual([[0, 0], [1000, 1000]])
    expect(result.scene.composition.frameRate).toBe(60)
    const host = hostAPI(), before = structuredClone(host.scene)
    expect(() => host.api.composition({ frameRate: 0 })).toThrow('Invalid composition')
    expect(host.scene).toEqual(before)
  })
  it('refuses adding a previously absent control to a keyed existing point', () => {
    const host = hostAPI(), layer = host.api.addSpline('line', { x1: 0, y1: 0, x2: 100, y2: 0 })!, s = layer.spline
    const point = Object.keys(s.data.points)[0], segment = Object.keys(s.data.segments)[0]
    s.setPointType(point, 'bezierCorner'); s.setSegmentType(segment, 'cubic')
    // Remove only the selected control before giving that anchor a live driver.
    const out = Object.values(s.data.handles).find(h => h.pointId === point && h.kind === 'out')
    if (out) s.removeHandle(point, 'out')
    host.api.createTimeline({ id: 'human' }).key(layer, `spline.points.${point}.x`, 0, 0)
    const before = structuredClone(host.scene), writes = host.writes
    expect(() => s.setHandle(point, 'out', { x: 20, y: 30 })).toThrow(/keyed|timeline|driven/)
    expect(host.scene).toEqual(before); expect(host.writes).toBe(writes)
  })
})
