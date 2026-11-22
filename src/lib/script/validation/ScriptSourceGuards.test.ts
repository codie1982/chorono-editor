import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newSplineLayerFromPrimitive } from '../../defaults'
import type { ChronoScene, Layer } from '../../types'
import type { EditorCommand } from '../../editor/commands-keyframe'
import { createSceneAPI } from '../api/SceneAPI'
import { makeScriptPatchCommand } from './ScriptPatchCommand'
import { newModelLayer } from '../../model3d/source/modelDefaults'
import { runSafeScript } from '../../mcp/sandbox'
import { assertSafeScriptData } from '../api/scriptData'
import { layerRegistry } from '../../registry'

/** Independent authored-source fixture with explicit manual siblings/keys. */
function fixture(): ChronoScene {
  return { ...emptyScene(), layers: [{ ...newRectLayer(), id: 'hero', name: 'Manual hero' }, { ...newRectLayer(), id: 'other', name: 'Manual sibling' }],
    timelines: [{ id: 'manual', durationMs: 1000, autoplay: false, loop: false, tracks: [
      { target: 'layers.hero.transform.x', keyframes: [{ id: 'manual-key', timeMs: 100, value: 50, easing: { type: 'easeOut' }, tangentMode: 'aligned' }] },
    ] }] }
}

/** Exercise the same host boundary as the manual console without evaluating JS. */
function harness(initial = fixture()) {
  let scene = initial
  const commands: EditorCommand[] = []
  const api = createSceneAPI({ getScene: () => scene, applyCommand(command) { const next = command.execute(scene); commands.push(command); scene = next } }, () => {})
  return { api, source: () => scene, commands }
}

describe('script set/patch source preservation', () => {
  it.each(['set','patch'] as const)('%s refuses animated leaf writes and container removals without changing any source', method => {
    const h = harness(), original = h.source(), hero = h.api.get('hero')!
    for (const patch of [{ transform: { ...original.layers[0].transform, x: 123 } }, { transform: undefined }]) {
      expect(() => hero[method](patch as Partial<Layer>)).toThrow(/Animated/)
      expect(h.source()).toBe(original); expect(h.commands).toHaveLength(0)
    }
  })
  it('preserves manual siblings and every key while merging an unrelated field and tolerates exact driven no-ops', () => {
    const h = harness(), initial = h.source(), hero = h.api.get('hero')!
    hero.patch({ transform: { y: 80 }, style: { fill: { color: '#112233' } } })
    expect(h.source().layers[0]).toMatchObject({ transform: { x: initial.layers[0].transform.x, y: 80 }, style: { fill: { type: 'solid', color: '#112233' } } })
    expect(h.source().timelines).toBe(initial.timelines)
    expect(h.source().layers[1]).toBe(initial.layers[1])
    hero.set({ transform: structuredClone(h.source().layers[0].transform) })
    expect(h.source().timelines[0].tracks[0].keyframes[0]).toBe(initial.timelines[0].tracks[0].keyframes[0])
  })
  it.each(['pos','rotation','scale','opacity','size','fill'] as const)('routes the %s shortcut through the same guard', property => {
    const source = fixture(), hero = source.layers[0]
    const path = { pos:'transform.x', rotation:'transform.rotationDeg', scale:'transform.scaleX', opacity:'opacity', size:'size.width', fill:'style.fill.color' }[property]
    source.timelines[0].tracks = [{ target: `layers.hero.${path}`, keyframes: [{ id:'owned',timeMs:0,value:property === 'fill' ? '#000000' : 1,easing:{type:'linear'} }] }]
    const h = harness(source), handle = h.api.get(hero.id)!
    expect(() => { Object.assign(handle, { [property]: {pos:[20,30],rotation:10,scale:[2,2],opacity:.5,size:[30,40],fill:'#ff0000'}[property] }) }).toThrow(/Animated/)
    expect(h.source()).toBe(source)
  })
  it.each(['locked','frozen'] as const)('honors %s on layers/ancestors; unlock must be a separate explicit edit', flag => {
    const source = fixture(); source.layers[0][flag] = true
    const h = harness(source), hero = h.api.get('hero')!
    expect(() => hero.patch({ [flag]: false, name:'Overwritten' })).toThrow(/locked or frozen/)
    hero.patch({ [flag]: false }); hero.patch({ name:'Explicit rename' })
    expect(h.source().layers[0].name).toBe('Explicit rename')
    const parent = { ...newRectLayer(), id:'parent',type:'group' as const, [flag]:true }
    const inherited = fixture(); inherited.layers[0].parentId = 'parent'; inherited.layers.push(parent)
    expect(() => harness(inherited).api.get('hero')!.patch({ name:'Blocked' })).toThrow(/locked or frozen/)
  })
  it.each([{ id:'replacement' }, { type:'text' }, { mode:'other' }, { instanceOf:'other' }])('refuses identity/ownership mutation %j', patch => {
    const h = harness(), initial = h.source()
    expect(() => h.api.get('hero')!.set(patch as Partial<Layer>)).toThrow(/identity|owned content/)
    expect(h.source()).toBe(initial)
  })
  it('rejects missing/cyclic/non-group parents and retains the original graph', () => {
    const h = harness()
    expect(() => h.api.get('hero')!.parent('missing')).toThrow(/Parent/)
    expect(() => h.api.get('hero')!.parent('other')).toThrow(/Parent/)
    const g = h.api.add('group'); expect(() => g.parent(g)).toThrow(/cyclic/)
  })
  it('owns input arguments and rechecks stale source/driver/ancestor state when deferred', () => {
    const source = fixture(), patch = { transform:{ y:42 } }
    const command = makeScriptPatchCommand(source, 'hero', patch, true)
    patch.transform.y = 99
    const next = command.execute(source)
    expect(next.layers[0].transform.y).toBe(42)
    expect(command.undo(next).layers[0]).toBe(source.layers[0])
    const manual = { ...source, layers: source.layers.map(layer => layer.id === 'hero' ? { ...layer, name:'New human name' } : layer) }
    expect(() => command.execute(manual)).toThrow(/source changed/)
    const driver = { ...source, parameterWires:[{ id:'w',enabled:true,blendMode:'override' as const,source:{propertyPath:'input',valueType:'number' as const},target:{layerId:'hero',propertyPath:'transform.y',valueType:'number' as const},expression:'source',createdAt:0,updatedAt:0 }] }
    expect(() => command.execute(driver)).toThrow(/wire/)
  })
  it('protects existing binding, live formula, constant recipe and inherited instance fields', () => {
    const source = fixture(); source.layers[0].paramBindings = { opacity:'amount' }
    const h = harness(source)
    expect(() => h.api.get('hero')!.patch({ opacity:.2 })).toThrow(/binding/)
    expect(() => h.api.get('hero')!.set({ paramBindings:{} })).toThrow(/owning workflow/)
    expect(() => h.api.get('hero')!.patch({ paramBindings:{'transform.x':'amount'} })).toThrow(/already owns/)
    const constant = fixture(); constant.layers[0].inputExpressions = {version:1,fields:{'transform.y':{formula:'2+3',value:5}}}
    expect(() => harness(constant).api.get('hero')!.patch({transform:{y:25}})).toThrow(/input expression/)
    expect(() => harness(constant).api.get('hero')!.patch({paramBindings:{'transform.y':'amount'}})).toThrow(/already owns/)
    const live = fixture(); live.layers[0].propertyExpressions = {version:1,fields:{opacity:{formula:'0.5',resultType:'number',timelineId:'manual',sources:{}}}}
    expect(() => harness(live).api.get('hero')!.patch({opacity:.2})).toThrow(/live expression/)
    const instance = fixture(); instance.layers[1] = {...instance.layers[1],instanceOf:'hero'}
    expect(() => harness(instance).api.get('other')!.fill = '#000').toThrow(/instance source/)
    const editable = harness(instance); editable.api.get('other')!.pos = [10,20]
    expect(editable.source().layers[1].instanceOf).toBe('hero')
  })
})

describe('script value admission', () => {
  it.each(layerRegistry.getAll().filter(definition => definition.kind !== 'model3d').map(definition => definition.kind))('retains the native default for 2D kind %s', kind => {
    const h = harness(emptyScene())
    const created = h.api.add(kind)
    expect(created.type).not.toBe('model3d')
    expect(h.source().layers).toHaveLength(1)
  })
  it.each([
    {opacity:-.1},{opacity:1.1},{opacity:'1'},{size:{width:-1,height:20}},{size:{width:20}},
    {transform:{x:1}}, {transform:{z:10}}, {hidden:'true'}, {blendMode:'invented'},
    {style:{fill:{type:'invented'}}}, {style:{fill:{opacity:30}}}, {style:{stroke:{color:'#000'}}},
    {style:{fill:{type:'gradient',gradient:{type:'linear',stops:[{offset:2,color:'#000'},{offset:1,color:'#fff'}]}}}},
    {style:{fill:{type:'gradient'}}}, {style:{stroke:{color:'#000',width:1,dashArray:[-1]}}},
    {effects:{blur:-1}}, {startMs:400,endMs:300}, {style:false}, {size:false}, {style:{fill:false}},
    {text:{value:45,fontSize:20,color:'#000'}}, {name:25}, {shapeKind:'unknown'},
  ])('refuses invalid edited source %j atomically', patch => {
    const h = harness(), original = h.source()
    expect(() => h.api.get('other')!.set(patch as Partial<Layer>)).toThrow()
    expect(h.source()).toBe(original)
  })
  it('preserves unchanged legacy values and extension metadata while validating only changed siblings', () => {
    const source = fixture(); source.layers[1].size!.width = -7
    source.layers[1].style!.fill!.gradient = {type:'linear',stops:[]} // inactive imported payload
    const h = harness(source)
    h.api.get('other')!.patch({name:'New name',transform:{y:42},style:{fill:{color:'#abcdef'}}})
    expect(h.source().layers[1].size!.width).toBe(-7)
    expect(h.source().layers[1].style!.fill!.gradient).toBe(source.layers[1].style!.fill!.gradient)
  })
  it('rejects hostile/non-data values before evaluating getters or custom serializers', () => {
    let called = 0
    const getter = Object.defineProperty({}, 'value', { enumerable:true,get() { called++; return 1 } })
    const serializer = {toJSON() { called++; return {} }}
    const cyclic: Record<string,unknown> = {}; cyclic.self = cyclic
    for (const value of [getter,serializer,cyclic,new Date(),{fn:()=>1},{n:NaN},{n:Infinity},{value:Symbol('x')},[undefined],Array(2),JSON.parse('{"__proto__":{}}')]) expect(() => assertSafeScriptData(value)).toThrow()
    expect(called).toBe(0)
  })
  it('refuses orphan/locked/animated spline edits through raw patch and preserves all geometry and keys', () => {
    const source = fixture(), spline = newSplineLayerFromPrimitive('rectangle',{width:100,height:60})!
    spline.id = 'curve'; source.layers.push(spline)
    const point = Object.keys(spline.spline!.points)[0]
    const broken = structuredClone(spline.spline!); delete broken.points[point]
    expect(() => harness(source).api.get('curve')!.set({spline:broken})).toThrow()
    spline.spline!.points[point].locked = true
    expect(() => harness(source).api.get('curve')!.patch({spline:{points:{[point]:{x:10}}}})).toThrow(/locked/)
    spline.spline!.points[point].locked = false
    source.timelines[0].tracks.push({target:`layers.curve.spline.points.${point}.x`,keyframes:[{id:'point-key',timeMs:0,value:0,easing:{type:'linear'}}]})
    expect(() => harness(source).api.get('curve')!.patch({spline:{points:{[point]:{x:10}}}})).toThrow(/Animated/)
  })
})

describe('QuickJS 2D-only script boundary', () => {
  it.each([
    "scene.add('model3d')", "scene.get('model').patch({model3d:{camera:{yaw:70}}})",
    "scene.clone(scene.get('model'))", "scene.remove(scene.get('model'))",
    "scene.get('model').key('model3d.camera.yaw',500,60)",
    "scene.timeline('internal').removeTrack('layers.model.model3d.camera.yaw')", "scene.deleteTimeline('internal')",
    "scene.wire('model3d.camera.yaw','opacity','source',{sourceLayerId:'model',targetLayerId:'hero'})",
    "scene.get('hero').patch({paramBindings:{'model3d.position.x':'amount'}})",
    "scene.get('hero').key('transform.z',500,30)",
  ])('refuses internal writes/removals: %s', async code => {
    const source = fixture(); source.layers.push(newModelLayer('model'))
    source.timelines.push({id:'internal',durationMs:1000,autoplay:false,loop:false,tracks:[{target:'layers.model.model3d.camera.yaw',keyframes:[{id:'internal-key',timeMs:0,value:30,easing:{type:'linear'}}]}]})
    const original = structuredClone(source)
    await expect(runSafeScript(`scene.get('other').patch({name:'Should roll back'});${code}`,source)).rejects.toThrow()
    expect(source).toEqual(original)
  })
  it('allows 2D box placement and key edits without touching model payload or legacy internal keys', async () => {
    const source = fixture(); source.layers.push(newModelLayer('model'))
    source.timelines[0].tracks.push({target:'layers.model.model3d.camera.yaw',keyframes:[{id:'legacy-internal',timeMs:0,value:30,easing:{type:'linear'}}]})
    const result = await runSafeScript("const box=scene.get('model');box.pos=[40,60];box.size=[300,200];box.key('opacity',500,.5);scene.get('other').patch({name:'Preserved drawing'});", source)
    expect(result.scene.layers[2].model3d).toEqual(source.layers[2].model3d)
    expect(result.scene.timelines[0].tracks.slice(0,2)).toEqual(source.timelines[0].tracks)
    expect(result.scene.layers[0]).toEqual(source.layers[0])
  })
  it('validates keys through both handle bindings and keeps fractional times and existing curve metadata', async () => {
    const source = fixture()
    for (const code of ["scene.get('hero').key('opacity',50,2)","scene.timeline('manual').key('hero','opacity',50,-1)","scene.timeline('manual').track('layers.hero.opacity',{keyframes:[{id:'bad',timeMs:0,value:4,easing:{type:'linear'}}]})"]) await expect(runSafeScript(code,source)).rejects.toThrow()
    const result = await runSafeScript("const h=scene.get('hero');h.key('transform.x',100,60);h.key('transform.x',100.25,75)",source)
    expect(result.scene.timelines[0].tracks[0].keyframes[0]).toEqual({...source.timelines[0].tracks[0].keyframes[0],value:60})
    expect(result.scene.timelines[0].tracks[0].keyframes[1].timeMs).toBe(100.25)
  })
})
