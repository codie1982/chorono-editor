import {afterEach,describe,expect,it,vi} from 'vitest'
import {acquireRasterImage} from './RasterExportEngine'
import {OutputResources} from '../resources'
import {ResourceBudget} from '../../resources/budget'
import '../../registry/bootstrap'
import {emptyScene,newRectLayer} from '../../defaults'
import {canvasRenderer} from '../../render/CanvasRenderer'
import {surfaceStub} from '../../render/resources/__tests__/surfaceStub'

vi.mock('../../render/CanvasRenderer',()=>({canvasRenderer:{render:vi.fn()}}))
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()})

/** Real encoder callback contract with pixel-free canvas doubles. Native QA
 * compares actual rendered output independently; these tests prove lifetime. */
function canvases(encode:(canvas:HTMLCanvasElement,done:(blob:Blob|null)=>void)=>void){
  const created:HTMLCanvasElement[]=[]
  const create=vi.fn(()=>{const canvas=surfaceStub(0,0);canvas.toBlob=(done)=>encode(canvas,done);created.push(canvas);return canvas})
  vi.stubGlobal('document',{createElement:create});return {created,create}
}
const scene=()=>{const value=emptyScene();return {...value,composition:{...value.composition,width:32,height:32}}}

describe('owned raster frame output',()=>{
  it('forwards runtime parameters into the complete frame before final rendering',async()=>{
    canvases((_canvas,done)=>done(new Blob(['encoded'])) )
    const resources=new OutputResources(),value=scene(),rect={...newRectLayer(),id:'rect'}
    value.timelines=[{id:'clock',durationMs:1000,autoplay:true,loop:false,tracks:[]}]
    value.parameters=[{id:'width',name:'Width',type:'number',defaultValue:4}]
    rect.propertyExpressions={version:1,fields:{'size.width':{resultType:'number',formula:'width+timeSec',timelineId:'clock',sources:{width:{propertyPath:'width',valueType:'number'}}}}}
    value.layers=[rect]
    const source=JSON.stringify(value),params=new Map([['width',12]])
    const result=await acquireRasterImage(value,new Map(),{format:'png',timeMs:500,paramValues:params},{resources})
    try{
      const options=vi.mocked(canvasRenderer.render).mock.calls.at(-1)![5]!
      expect(options.overrides!.get('layers.rect.size.width')).toBe(12.5)
      expect(options.paramValues).toBe(params);expect(JSON.stringify(value)).toBe(source)
    }finally{result.release();resources.dispose()}
  })
  it('retains only encoded output after native completion, then releases the final consumer pin',async()=>{
    const host=canvases((_canvas,done)=>done(new Blob(['encoded'],{type:'image/png'}))),budget=new ResourceBudget({maxBytes:1024**2})
    const resources=new OutputResources({budget})
    const result=await acquireRasterImage(scene(),new Map(),{format:'png',scale:2},{resources})
    expect(result.value).toMatchObject({width:64,height:64,warnings:[]})
    expect(host.created).toHaveLength(2);expect(host.created.every(canvas=>canvas.width===0&&canvas.height===0)).toBe(true)
    expect(budget.getSnapshot().chargedBytes).toBe(8)
    result.release();expect(budget.getSnapshot().chargedBytes).toBe(0);resources.dispose()
  })
  it('does not release canvases or the job slot before a cancelled native encoder actually calls back',async()=>{
    let complete!:(blob:Blob|null)=>void,started!:()=>void
    const encoding=new Promise<void>(yes=>{started=yes}),host=canvases((_canvas,done)=>{complete=done;started()})
    const resources=new OutputResources(),abort=new AbortController()
    const pending=acquireRasterImage(scene(),new Map(),{format:'png'},{resources,signal:abort.signal}),rejected=expect(pending).rejects.toMatchObject({name:'AbortError'})
    await encoding;abort.abort();await Promise.resolve()
    expect(host.created[0].width).toBe(32);expect(resources.getSnapshot().jobs.active).toBe(1)
    expect(resources.getSnapshot().residency.chargedBytes).toBeGreaterThan(4096)
    complete(new Blob(['late']));await rejected
    expect(host.created[0].width).toBe(0);expect(resources.getSnapshot().residency.chargedBytes).toBe(0);resources.dispose()
  })
  it('refuses unsupported pixel dimensions before constructing a native canvas',async()=>{
    const host=canvases((_canvas,done)=>done(new Blob(['x']))),resources=new OutputResources(),value=scene()
    value.composition.width=32768
    await expect(acquireRasterImage(value,new Map(),{format:'png'},{resources})).rejects.toThrow('pixel')
    expect(host.create).not.toHaveBeenCalled();expect(resources.getSnapshot().residency.chargedBytes).toBe(0);resources.dispose()
  })
  it('cleans all partial surfaces if native encoding fails',async()=>{
    const host=canvases((_canvas,done)=>done(null)),resources=new OutputResources()
    await expect(acquireRasterImage(scene(),new Map(),{format:'jpeg',background:'transparent',scale:2},{resources})).rejects.toThrow('encode failed')
    expect(host.created.every(canvas=>canvas.width===0&&canvas.height===0)).toBe(true)
    expect(resources.getSnapshot().residency.chargedBytes).toBe(0);resources.dispose()
  })
})
