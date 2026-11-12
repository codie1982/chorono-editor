import {afterEach,describe,expect,it} from 'vitest'
import '../../registry/bootstrap'
import {emptyScene,newTextLayer,newSplineLayerFromPrimitive} from '../../defaults'
import {expressionPrograms} from '../../core/expression/ExpressionProgramCache'
import {assertScenePropertyExpressions,type PropertyExpression} from './PropertyExpression'
import {propertyExpressionEvaluator} from './evaluatePropertyExpressions'
import {evaluateSceneFrame} from '../../runtime/evaluateSceneFrame'
import {expressionValueType} from '../../core/expression/ExpressionValue'

/** Exact maximum supported graph. All five result families use real schema or
 * stable spline coordinates. No dense keys, native handles or fake properties. */
function boundedFixture() {
  const scene=emptyScene()
  scene.timelines=[{id:'clock',durationMs:1000,loop:false,autoplay:true,tracks:[]}]
  const definition=(formula:string,resultType:PropertyExpression['resultType']):PropertyExpression=>({formula,resultType,timelineId:'clock',sources:{}})
  scene.layers=Array.from({length:128},(_,index)=>({...newTextLayer(),id:'label-'+index,
    propertyExpressions:{version:1 as const,fields:{
      'text.fontSize':definition('12+timeSec+'+index,'number'),
      'text.uppercase':definition('timeMs>='+index,'boolean'),
      'text.value':definition('concat("Layer '+index+':",fixed(timeSec,1))','string'),
      'text.color':definition('rgba('+index+',20,50,0.5)','color'),
    }},
  }))
  const spline=newSplineLayerFromPrimitive('circle',{radius:20})!,id=Object.keys(spline.spline!.points)[0]
  scene.layers[127]={...spline,id:'curve',propertyExpressions:{version:1,fields:{
    ['spline.points.'+id]:definition('vec2(127+timeSec,10)','vec2'),
    'transform.rotationDeg':definition('timeSec*127','number'),
    'opacity':definition('timeMs>500 ? 0.5 : 1','number'),
    'style.fill.color':definition('rgba(127,20,50,0.5)','color'),
  }}}
  return scene
}

afterEach(()=>{expressionPrograms.clear();propertyExpressionEvaluator.clear()})
describe('A5 expression resource limits',()=>{
  it('evaluates the exact 512-driver typed graph repeatedly without changing source or retaining output frames',()=>{
    const scene=boundedFixture(),source=JSON.stringify(scene)
    expressionPrograms.clear();assertScenePropertyExpressions(scene)
    for(let frame=0;frame<60;frame++){
      const value=evaluateSceneFrame(scene,frame*1000/59)
      expect(value.expressionErrors.size).toBe(0);expect(value.overrides.size).toBe(512)
      expect(expressionPrograms.size).toBeLessThanOrEqual(512)
      if(frame===59)expect(new Set(Array.from(value.overrides.values(),expressionValueType))).toEqual(new Set(['number','boolean','string','color','vec2']))
    }
    expect(JSON.stringify(scene)).toBe(source)
    expect(scene.timelines[0].tracks).toEqual([])
  })
  it('refuses 513 drivers atomically and reports one bounded scene failure during raw playback',()=>{
    const scene=boundedFixture()
    scene.layers[0].propertyExpressions!.fields.opacity={resultType:'number',formula:'0.5',timelineId:'clock',sources:{}}
    expect(()=>assertScenePropertyExpressions(scene)).toThrow(/512/)
    const result=evaluateSceneFrame(scene,500)
    expect(result.overrides.size).toBe(0);expect(result.expressionErrors.size).toBe(1)
    expect(result.expressionErrors.get('scene')).toMatch(/512/)
  })
  it('bounds the production parser cache across many valid and invalid transient drafts',()=>{
    expressionPrograms.clear()
    for(let draft=0;draft<1500;draft++){
      expressionPrograms.get(draft%2?'('+draft:'vec2('+draft+',2)')
      expect(expressionPrograms.size).toBeLessThanOrEqual(512)
    }
    expect(expressionPrograms.size).toBe(512)
    const invalid=expressionPrograms.get('(1499')
    expect(invalid.ast).toBeNull();expect(invalid.error).toBeTruthy()
    expect(expressionPrograms.get('(1499')).toBe(invalid)
  })
})
