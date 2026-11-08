import {expect,it,vi} from 'vitest'
import {emptyScene,newRectLayer,newTextLayer} from '../../defaults'
import {prepareRenderFrame} from '../prepareRenderFrame'
import {NativeDemandBranches} from './NativeDemandBranches'

it('keeps sparse candidate ancestry and mask/instance hosts without rescanning immutable source metadata',()=>{
 const a={...newRectLayer(),id:'g',type:'group' as const},font={...newTextLayer(),id:'text',parentId:'g'}
 const free={...newRectLayer(),id:'free'},mask={...free,id:'mask-host',masks:[{id:'m',maskLayerId:'text',mode:'intersect' as const,inverted:false,feather:0}]}
 const instance={...free,id:'instance',instanceOf:'text'}
 let revision=0
 const find=vi.fn((layer:typeof free)=>({id:'test',supports:()=>true,render(){},nativeMediaFree:layer.type!=='text'}))
 const registry={find,getRevision:()=>revision},hints=new NativeDemandBranches(registry)
 const scene={...emptyScene(),layers:[a,font,free,mask,instance]},frame=prepareRenderFrame(scene,0)
 expect(Array.from(hints.select(frame)).sort()).toEqual(['g','instance','mask-host','text'])
 expect(find).toHaveBeenCalledTimes(3) // mask and instance remain unconditional candidates.
 hints.select(prepareRenderFrame(scene,12,new Map()));expect(find).toHaveBeenCalledTimes(3)
 revision++;hints.select(frame);expect(find).toHaveBeenCalledTimes(6)
 const moved={...scene,layers:scene.layers.map(l=>l.id==='text'?{...l,parentId:'free'}:l)}
 expect(Array.from(hints.select(prepareRenderFrame(moved,0))).sort()).toEqual(['free','instance','mask-host','text'])
})
it('never caches an empty dynamic dependency query as proof of being native-free and bounds parent cycles',()=>{
 const a={...newRectLayer(),id:'a',parentId:'b'},b={...newRectLayer(),id:'b',parentId:'a'}
 const find=vi.fn(()=>({id:'dynamic',supports:()=>true,render(){},mediaDependencies:()=>({})})),hints=new NativeDemandBranches({find,getRevision:()=>0})
 expect(Array.from(hints.select(prepareRenderFrame({...emptyScene(),layers:[a,b]},0))).sort()).toEqual(['a','b'])
})
