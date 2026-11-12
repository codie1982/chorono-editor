import { describe, expect, it } from 'vitest'
import '../../registry/bootstrap'
import { emptyScene, newRectLayer, newTextLayer, newSplineLayerFromPrimitive } from '../../defaults'
import { makeInputExpressionCommand } from '../../editor/inputExpressions/InputExpressionCommand'
import { inputExpression, sameInputExpressionValue } from '../../editor/inputExpressions/InputExpression'
import { numericInputExpression } from '../../editor/inputExpressions/NumericInputExpression'
import { makeSetPropertyExpressionCmd, makeRemovePropertyExpressionCmd } from '../../editor/inputExpressions/PropertyExpressionCommand'
import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'
import { prepareRenderFrame } from '../../render/prepareRenderFrame'
import { exportSVG } from '../../export/vector/SVGExporter'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { ChronoPlayer } from '../../player/ChronoPlayer'
import { makeCloneForestCmd } from '../../editor/commands-clone-forest'
import { keyableChannels } from '../../timeline/authoring/keyableChannels'
import { preparePropertyExpressionBake } from './preparePropertyExpressionBake'
import { makeApplyPropertyExpressionBakeCmd } from '../../editor/inputExpressions/PropertyExpressionBakeCommand'
import { listExpressionLayerRefs } from './PropertyExpressionCapability'
import { resolveLayerWorldBounds } from '../../geometry/resolveLayerWorldBounds'
import { resolveSplineEditGeometry } from '../../../components/canvas/splineEditGeometry'

/** Actual registry/source fixture with stable point IDs, ordinary manual keys,
 * styles and metadata. Rendering and authoring share these same records. */
function fixture() {
  const scene = emptyScene(), spline = newSplineLayerFromPrimitive('circle', { radius: 80 })!
  scene.layers = [{ ...newRectLayer(), id: 'shape' }, { ...newTextLayer(), id: 'label' }, { ...spline, id: 'spline' }]
  scene.timelines = [{ id: 'clock', durationMs: 1000, loop: false, autoplay: true, tracks: [{ target: 'layers.label.transform.x', keyframes: [{ id: 'manual-key', timeMs: 0, value: 905, easing: { type: 'linear' } }] }] }]
  return scene
}

describe('typed property/source adapters', () => {
  it('commits color/string/select/boolean recipes with portable typed data and exact Undo', () => {
    let scene = fixture()
    const tests = [
      ['shape', 'style.fill.color', 'rgba(255,0,0,.5)', 'color'],
      ['label', 'text.value', 'concat("Frame ",str(2+3))', 'string'],
      ['shape', 'blendMode', 'if(true,"multiply","screen")', 'string'],
      ['label', 'text.uppercase', '2>1', 'boolean'],
    ] as const
    for (const [id, path, formula, kind] of tests) {
      const before = scene, command = makeInputExpressionCommand(before, id, path, formula, kind)
      scene = command.execute(before)
      expect(command.undo(scene)).toBe(before)
      const layer = scene.layers.find(layer => layer.id === id)!, record = inputExpression(layer, path)!
      expect(record.formula).toBe(formula); expect(record.resultType).toBe(kind)
      expect(numericInputExpression(layer, path)).toBeUndefined()
    }
    expect(scene.layers[0].style?.fill?.color).toBe('rgba(255,0,0,0.5)')
    expect(scene.layers[1].text?.value).toBe('Frame 5'); expect(scene.layers[0].blendMode).toBe('multiply')
    expect(parseSceneJson(JSON.stringify(scene)).layers).toEqual(scene.layers)
    expect(scene.timelines[0].tracks[0].keyframes[0].value).toBe(905)
    expect(() => makeInputExpressionCommand(scene, 'shape', 'blendMode', '"invalid"', 'string').execute(scene)).toThrow(/one of/)
    expect(() => makeInputExpressionCommand(scene, 'shape', 'style.fill.color', '"invalid"', 'color').execute(scene)).toThrow(/return color/)
  })
  it('keeps constant point moves in the spline domain, including attached handles and metadata', () => {
    const scene = fixture(), layer = scene.layers[2], point = Object.values(layer.spline!.points)[0]
    const handles = Object.values(layer.spline!.handles).filter(handle => handle.pointId === point.id)
    const command = makeInputExpressionCommand(scene, layer.id, 'spline.points.' + point.id, `vec2(${point.x+10},${point.y+20})`, 'vec2'), next = command.execute(scene)
    expect(next.layers[2].spline!.points[point.id]).toEqual({ ...point, x: point.x+10, y: point.y+20 })
    for (const handle of handles) expect(next.layers[2].spline!.handles[handle.id]).toEqual({ ...handle, x: handle.x+10, y: handle.y+20 })
    expect(command.undo(next)).toBe(scene)
    expect(sameInputExpressionValue(next.layers[2].spline!.points[point.id], {x:point.x+10,y:point.y+20}, 'vec2')).toBe(true)
  })
  it('shares typed live color/text/select/point results across player/render/SVG/clone and capture', () => {
    let scene = fixture()
    for (const [id,path,formula,kind] of [
      ['shape','style.fill.color','rgba(timeMs/4,0,200,.5)','color'],
      ['label','text.value','concat("T ",fixed(timeSec,1))','string'],
      ['shape','blendMode','timeMs<500 ? "multiply" : "screen"','string'],
    ] as const) scene = makeSetPropertyExpressionCmd(scene,id,path,{ resultType:kind,formula,timelineId:'clock',sources:{} }).execute(scene)
    const point = Object.values(scene.layers[2].spline!.points)[0], path = 'spline.points.'+point.id
    scene = makeSetPropertyExpressionCmd(scene,'spline',path,{resultType:'vec2',formula:'vec2(10+timeSec*2,20)',timelineId:'clock',sources:{}}).execute(scene)
    const before = JSON.stringify(scene), player = new ChronoPlayer(scene), frame = evaluateSceneFrame(scene,500)
    expect(player.tick(500).overrides).toEqual(frame.overrides)
    const visual = prepareRenderFrame(scene,500).scene
    expect(visual.layers[0].style?.fill?.color).toBe('rgba(125,0,200,0.5)')
    expect(visual.layers[1].text?.value).toBe('T 0.5'); expect(visual.layers[0].blendMode).toBe('screen')
    expect(visual.layers[2].spline!.points[point.id]).toEqual({...point,x:11,y:20})
    expect(exportSVG(scene,{timeMs:500}).svg).toContain('T 0.5')
    const geometry = resolveSplineEditGeometry(scene.layers[2],scene,500,frame.overrides)!
    expect(geometry.worldSpline.points[point.id].x).toBeCloseTo(geometry.worldMatrix.applyToPoint({x:11,y:20}).x)
    expect(resolveLayerWorldBounds(scene.layers[2],scene,500,frame.overrides)).toBeTruthy()
    const converted = makeRemovePropertyExpressionCmd(scene,'shape','style.fill.color',{timeMs:500}).execute(scene)
    expect(converted.layers[0].style?.fill?.color).toBe('rgba(125,0,200,0.5)')
    const clone = makeCloneForestCmd(scene,{sourceIds:['shape','label','spline']}), copied = clone.execute(scene)
    expect(evaluateSceneFrame(copied,500).overrides.get('layers.'+clone.idMaps[0].shape+'.style.fill.color')).toEqual({r:125,g:0,b:200,a:127.5})
    expect(JSON.stringify(scene)).toBe(before)
  })
  it('orders vector/child dependencies and rejects overlapping native/live writes', () => {
    let scene = fixture(); const point = Object.values(scene.layers[2].spline!.points)[0], path='spline.points.'+point.id
    scene = makeSetPropertyExpressionCmd(scene,'spline',path,{resultType:'vec2',formula:'vec2(100+timeSec,200)',timelineId:'clock',sources:{}}).execute(scene)
    scene = makeSetPropertyExpressionCmd(scene,'shape','size.width',{resultType:'number',formula:'px+30',timelineId:'clock',sources:{px:{layerId:'spline',propertyPath:path+'.x',valueType:'number'}}}).execute(scene)
    expect(evaluateSceneFrame(scene,500).overrides.get('layers.shape.size.width')).toBe(130.5)
    expect(() => makeSetPropertyExpressionCmd(scene,'spline',path+'.x',{resultType:'number',formula:'40',timelineId:'clock',sources:{}}).execute(scene)).toThrow(/overlapping/)
    const native = fixture(), nativePath = 'spline.points.' + Object.keys(native.layers[2].spline!.points)[0]
    native.timelines[0].tracks.push({ target:'layers.spline.'+nativePath+'.x', keyframes:[{id:'human-point',timeMs:0,value:40,easing:{type:'linear'}}] })
    expect(() => makeSetPropertyExpressionCmd(native,'spline',nativePath,{resultType:'vec2',formula:'vec2(2,3)',timelineId:'clock',sources:{}}).execute(native)).toThrow(/animated/)
  })
  it('bakes overlapping vector source dependencies, keeps manual keys and undoes atomically', () => {
    let scene=fixture(); const point=Object.values(scene.layers[2].spline!.points)[0], path='spline.points.'+point.id
    scene=makeSetPropertyExpressionCmd(scene,'spline',path,{resultType:'vec2',formula:'vec2(100+timeSec,200)',timelineId:'clock',sources:{}}).execute(scene)
    scene=makeSetPropertyExpressionCmd(scene,'shape','size.width',{resultType:'number',formula:'px+30',timelineId:'clock',sources:{px:{layerId:'spline',propertyPath:path+'.x',valueType:'number'}}}).execute(scene)
    const prepared=preparePropertyExpressionBake(scene,'shape','size.width',{startMs:0,endMs:1000,fps:30,tolerance:.001})
    const command=makeApplyPropertyExpressionBakeCmd(prepared), baked=command.execute(scene)
    expect(evaluateSceneFrame(baked,500).overrides.get('layers.shape.size.width')).toBeCloseTo(130.5)
    expect(baked.timelines[0]).toBe(scene.timelines[0]); expect(command.undo(baked)).toBe(scene)
    expect(()=>command.execute({...scene})).toThrow(/changed/)
    const refs=listExpressionLayerRefs(scene.layers[2])
    expect(refs).toContainEqual({layerId:'spline',propertyPath:path,valueType:'vec2'})
    expect(refs).toContainEqual({layerId:'spline',propertyPath:path+'.x',valueType:'number'})
    expect(listExpressionLayerRefs(scene.layers[1])).toContainEqual({layerId:'label',propertyPath:'text.value',valueType:'string'})
  })

  it('keeps baked whole-point coordinates keyable without copying topology metadata', () => {
    let scene=fixture(); const point=Object.values(scene.layers[2].spline!.points)[0], path='spline.points.'+point.id
    scene=makeSetPropertyExpressionCmd(scene,'spline',path,{resultType:'vec2',formula:'vec2(timeSec,40)',timelineId:'clock',sources:{}}).execute(scene)
    const prepared=preparePropertyExpressionBake(scene,'spline',path,{startMs:0,endMs:1000,fps:30,tolerance:.001})
    const baked=makeApplyPropertyExpressionBakeCmd(prepared).execute(scene)
    const channel=keyableChannels(baked.layers[2],prepared.timeline.tracks,'animated',new Set()).find(channel=>channel.path===path)
    expect(channel?.value).toEqual({x:point.x,y:point.y})
    expect(Object.keys(channel!.value as object)).toEqual(['x','y'])
  })

})
