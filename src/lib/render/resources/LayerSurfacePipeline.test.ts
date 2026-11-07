import { afterEach, describe, expect, it, vi } from 'vitest'
import { newRectLayer } from '@/lib/defaults'
import { effectRegistry, type EffectDefinition } from '@/lib/effects'
import { gpuImageEffects } from '@/lib/render/gpu/effects/GPUImageEffects'
import { CanvasSurfacePool } from './CanvasSurfacePool'
import { LayerSurfacePipeline, type LayerSurfacePass } from './LayerSurfacePipeline'
import { surfaceStub } from './__tests__/surfaceStub'

const pools: CanvasSurfacePool[] = []
/** Creates one shared budget and a complete content/effect/mask destination contract. */
function fixture(maxBytes = 128, width = 2, height = 2) {
  const pool = new CanvasSurfacePool({ maxBytes, createCanvas: surfaceStub })
  pools.push(pool)
  const layer = newRectLayer(), mask = newRectLayer()
  const composite = vi.fn()
  const pass: LayerSurfacePass = { width,height,layer,effects:[],
    masks:[{id:'mask',maskLayerId:mask.id,mode:'add',opacity:0.6,feather:2,inverted:true}],
    drawContent: c => c.fillRect(0,0,width,height),
    drawMask: (_layer,c) => c.fillRect(0,0,width/2,height),
    getLayer: id => id===mask.id?mask:undefined, composite }
  return { pool,pass,composite,pipeline:new LayerSurfacePipeline(pool) }
}
afterEach(() => { pools.splice(0).forEach(pool=>pool.dispose());vi.restoreAllMocks() })

describe('LayerSurfacePipeline bounded composition',()=>{
  it('keeps host, shadow scratch and mask passes at four reusable surfaces over 100 frames',()=>{
    vi.spyOn(gpuImageEffects,'blur').mockReturnValue(null)
    const {pool,pass,pipeline,composite}=fixture()
    pass.effects=[{id:'shadow',type:'shadow',enabled:true,params:{blur:3}}]
    for(let i=0;i<100;i++) pipeline.render(pass)
    expect(composite).toHaveBeenCalledTimes(100)
    expect(pool.getSnapshot()).toMatchObject({allocations:4,activeSurfaces:0,residentBytes:64,peakResidentBytes:64,budgetDenials:0})
    expect(pool.getSnapshot().reuses).toBeGreaterThan(400)
    pool.clearIdle()
    expect(pool.getSnapshot().residentBytes).toBe(0)
  })

  it('admits a long native chain plus masks at 4K within the 128 MiB shared default',()=>{
    vi.spyOn(gpuImageEffects,'blur').mockReturnValue(null)
    const {pool,pass,pipeline}=fixture(128*1024**2,3840,2160)
    const chain:EffectDefinition[]=['blur','glow','shadow','innerShadow','innerGlow','tint','vignette']
      .map(type=>({id:type,type,enabled:true,params:{radius:3,blur:3}}))
    pass.effects=Array.from({length:10},()=>chain).flat()
    pipeline.render(pass)
    expect(pool.getSnapshot()).toMatchObject({allocations:4,activeSurfaces:0,peakResidentBytes:4*3840*2160*4,budgetDenials:0})
  })

  it.each(['content','effect','mask','lookup','composite'] as const)('returns all leases on %s failure',stage=>{
    const {pool,pass,pipeline}=fixture()
    const fail=()=>{throw new Error('pass failed')}
    let target=pipeline
    if(stage==='content')pass.drawContent=fail
    if(stage==='effect')target=new LayerSurfacePipeline(pool,{applyChain:fail})
    if(stage==='mask')pass.drawMask=fail
    if(stage==='lookup')pass.getLayer=fail
    if(stage==='composite')pass.composite=fail
    expect(()=>target.render(pass)).toThrow('pass failed')
    expect(pool.getSnapshot()).toMatchObject({activeSurfaces:0,activeBytes:0})
  })

  it('fails admission before a fourth canvas allocation and never composites an unmasked fallback',()=>{
    const {pool,pass,pipeline,composite}=fixture(48)
    expect(()=>pipeline.render(pass)).toThrow(/budget exceeded/)
    expect(composite).not.toHaveBeenCalled()
    expect(pool.getSnapshot()).toMatchObject({allocations:3,activeBytes:0,budgetDenials:1})
  })

  it('uses separate nested leases and preserves the parent content throughout child rendering',()=>{
    const {pool,pass,pipeline}=fixture(96)
    let outer:HTMLCanvasElement|undefined
    const original=pass.drawContent
    pass.drawContent=context=>{
      outer=context.canvas
      pipeline.render({...pass,drawContent:child=>{
        expect(child.canvas).not.toBe(outer);original(child)
      }})
      expect(outer.width).toBe(2)
      expect(pool.getSnapshot().activeSurfaces).toBe(1)
      original(context)
    }
    pipeline.render(pass)
    expect(pool.getSnapshot()).toMatchObject({activeSurfaces:0,budgetDenials:0})
  })

  it('keeps a caller-owned chain input intact on a disabled or unknown effect',()=>{
    const {pass,pipeline,pool}=fixture()
    pass.masks=[]
    pass.effects=[{id:'none',type:'unknown',enabled:true,params:{}},{id:'off',type:'blur',enabled:false,params:{radius:3}}]
    pipeline.render(pass)
    expect(pool.getSnapshot()).toMatchObject({allocations:1,activeSurfaces:0})
    expect(effectRegistry.get('shadow')).toBeDefined()
  })
})
