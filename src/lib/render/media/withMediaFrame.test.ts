import {describe,expect,it,vi} from 'vitest'
import '../../registry/bootstrap'
import {emptyScene,newTextLayer} from '../../defaults'
import {FontAssetService} from '../../asset/fonts'
import {VisualAssetService} from '../../asset/visual'
import {VisualMediaSession} from './VisualMediaSession'
import {withMediaFrame} from './withMediaFrame'

/** Minimal platform adapter: frame evaluation and media dependency resolution
 * remain production code; only the native font registration is substituted. */
function fixture(){
  const scene=emptyScene(),label={...newTextLayer(),id:'label'}
  scene.composition={...scene.composition,width:100,height:100}
  scene.timelines=[{id:'clock',durationMs:1000,loop:false,autoplay:true,tracks:[]}]
  scene.parameters=[{id:'alternate',name:'Alternate',type:'boolean',defaultValue:false}]
  label.text={...label.text!,fontFamily:'A'}
  label.propertyExpressions={version:1,fields:{'text.fontFamily':{resultType:'string',formula:'alternate ? "B" : "A"',timelineId:'clock',sources:{alternate:{propertyPath:'alternate',valueType:'boolean'}}}}}
  scene.layers=[label]
  scene.assets=['A','B'].map(id=>({id,name:id,type:'font',url:id,metadata:{notes:'family: '+id,filesize:500}}))
  const context={canvas:{width:100,height:100},getTransform:()=>({a:1,b:0,c:0,d:1,e:0,f:0})} as unknown as CanvasRenderingContext2D
  return {scene,context}
}

describe('final media frame evaluation',()=>{
  it('prepares and draws the same caller-parameter frame without mutating source/defaults',async()=>{
    const {scene,context}=fixture(),source=JSON.stringify(scene)
    const decode=vi.fn(({alias}:{alias:string})=>({alias,ready:Promise.resolve(),dispose(){}}))
    const fonts=new FontAssetService({decoder:decode}),visual=new VisualAssetService(),media=new VisualMediaSession(visual,fonts)
    const params=new Map([['alternate',true]])
    media.start()
    try{
      await withMediaFrame(scene,500,context,{paramValues:params},(assets,overrides)=>{
        expect(overrides.get('layers.label.text.fontFamily')).toBe('B')
        expect(assets.fonts!.state(scene.assets[1])).toBe('ready')
        expect(assets.fonts!.state(scene.assets[0])).toBe('notResident')
        expect(decode.mock.calls[0][0]).toMatchObject({url:'B'})
      },media)
      expect(JSON.stringify(scene)).toBe(source);expect(params).toEqual(new Map([['alternate',true]]))
    }finally{media.stop();fonts.dispose();visual.dispose()}
  })
  it('borrows a complete supplied frame instead of reevaluating default parameters',async()=>{
    const {scene,context}=fixture(),overrides=new Map([['layers.label.text.fontFamily','B']])
    const fonts=new FontAssetService({decoder:({alias})=>({alias,ready:Promise.resolve(),dispose(){}})}),visual=new VisualAssetService(),media=new VisualMediaSession(visual,fonts)
    media.start()
    try{
      await withMediaFrame(scene,500,context,{overrides,paramValues:new Map([['alternate',false]])},(assets,actual)=>{
        expect(actual).toBe(overrides);expect(assets.fonts!.state(scene.assets[1])).toBe('ready')
      },media)
    }finally{media.stop();fonts.dispose();visual.dispose()}
  })
})
