import {describe,expect,it,vi} from 'vitest'
import {emptyScene,newTextLayer,newTimeline,newRectLayer} from '../../defaults'
import type {Asset} from '../../types'
import {FontAssetService,describeFont} from '../../asset/fonts'
import {VisualAssetService} from '../../asset/visual'
import {VisualMediaSession} from './VisualMediaSession'
import {VisualDemandResolver} from './VisualDemandResolver'
import {prepareRenderFrame} from '../prepareRenderFrame'
import {projectFrameFonts} from './projectFrameFonts'
import {fontFamilyVariants} from './fontFamilyVariants'

const font=(id:string,family=id):Asset=>({id,name:id,type:'font',url:id,metadata:{notes:`family: ${family}`,filesize:500}})
const text=(id:string,family=id)=>{const l=newTextLayer();l.id=id;l.text!.fontFamily=family;return l}
const context={canvas:{width:100,height:100},getTransform:()=>({a:1,b:0,c:0,d:1,e:0,f:0})} as unknown as CanvasRenderingContext2D
const input=(scene:ReturnType<typeof emptyScene>)=>({frame:prepareRenderFrame(scene,100),context})

describe('font demand and frame ownership',()=>{
  it('leaves unused fonts cold, retains selected hidden text and conservative family keyframe variants',()=>{
    const visible=text('visible','A'),hidden=text('hidden','B');hidden.hidden=true
    const scene:ReturnType<typeof emptyScene>={...emptyScene(),layers:[visible,hidden],assets:[font('A'),font('B'),font('unused'),font('C')],
      timelines:[{...newTimeline(),tracks:[{target:'layers.visible.text.fontFamily',keyframes:[{id:'a',timeMs:0,value:'A',easing:{type:'linear'}},{id:'c',timeMs:300,value:'C',easing:{type:'linear'}}]}]}]}
    const resolver=new VisualDemandResolver(),frame=input(scene)
    expect(resolver.resolve(frame).map(d=>d.asset.id).sort()).toEqual(['A','C'])
    expect(resolver.resolve({...frame,selected:new Set(['hidden'])}).map(d=>d.asset.id).sort()).toEqual(['A','B','C'])
    expect(fontFamilyVariants(scene.timelines)).toBe(fontFamilyVariants(scene.timelines))
    expect(fontFamilyVariants([{...scene.timelines[0],tracks:[]}]).size).toBe(0)
  })
  it('includes font mask/repeater sources and respects standalone hidden/group activity',()=>{
    const hidden=text('mask','Mask');hidden.hidden=true
    const host=newRectLayer();host.masks=[{id:'m',maskLayerId:hidden.id,mode:'intersect',inverted:false,feather:0}]
    const scene:ReturnType<typeof emptyScene>={...emptyScene(),layers:[host,hidden],assets:[font('Mask')]}
    expect(new VisualDemandResolver().resolve(input(scene)).map(d=>d.asset.id)).toEqual(['Mask'])
  })
  it('shares ready faces across owners but never serializes runtime aliases or borrows another source',async()=>{
    const decoder=vi.fn(({alias}:{alias:string})=>({alias,ready:Promise.resolve(),dispose:vi.fn()}))
    const fonts=new FontAssetService({decoder}),visual=new VisualAssetService(),viewport=new VisualMediaSession(visual,fonts),job=new VisualMediaSession(visual,fonts)
    const a=font('file-a','Brand'),b=font('file-b','Brand'),scene={...emptyScene(),layers:[text('t','Brand')],assets:[a]}
    const before=JSON.stringify(scene)
    viewport.start();job.start();viewport.request(input(scene));job.request(input(scene))
    await Promise.all([viewport.ready(),job.ready()]);expect(decoder).toHaveBeenCalledOnce()
    const map=job.elements(),projected=projectFrameFonts(scene,map.fonts),alias=projected.layers[0].text!.fontFamily
    expect(alias).toContain('__chorono_font_');expect(projected.layers[0].size).toBeUndefined()
    expect(projected.layers[0].transform).toBe(scene.layers[0].transform)
    expect(JSON.stringify(scene)).toBe(before);expect(JSON.stringify(map)).toBe('{}')
    const old=viewport.elements();viewport.stop();fonts.clearIdle()
    expect(map.fonts!.state(a)).toBe('ready');expect(old.fonts!.state(a)).toBe('notResident')
    viewport.start();viewport.request(input({...scene,assets:[b]}));await viewport.ready()
    expect(viewport.elements().fonts!.resolveFamily('Brand',[b])).not.toBe(alias)
    expect(map.fonts!.resolveFamily('Brand',[a])).toBe(alias)
    job.stop();expect(map.fonts!.resolveFamily('Brand',[a])).toBe('sans-serif')
    viewport.stop();fonts.dispose();visual.dispose()
  })
  it('reports required font failure and exposes cold/loading/ready status without map elements',async()=>{
    let resolve!:()=>void;const ready=new Promise<void>(yes=>{resolve=yes})
    const fonts=new FontAssetService({decoder:({alias})=>({alias,ready,dispose(){}})}),visual=new VisualAssetService(),session=new VisualMediaSession(visual,fonts)
    const a=font('A'),key=describeFont(a).key;session.start();session.setDemand([{key,asset:a,required:true}])
    const old=session.elements();expect(old.fonts!.state(a)).toBe('loading');resolve();await session.ready()
    expect(old.fonts!.state(a)).toBe('ready');expect(old.fonts!.resolveFamily('A',[a])).toContain('__chorono_font_')
    expect(old.size).toBe(0);session.stop();fonts.dispose();visual.dispose()
    const broken=new FontAssetService({decoder:()=>{throw new Error('font rejected')}}),bad=new VisualMediaSession(undefined,broken)
    bad.start();bad.setDemand([{key,asset:a,required:true}]);await expect(bad.ready()).rejects.toThrow('font rejected')
    expect(bad.elements().fonts!.state(a)).toBe('error');bad.stop();broken.dispose()
  })
})
