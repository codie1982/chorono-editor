import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import type { Layer } from '@/lib/types'
import { effectRegistry } from '@/lib/effects'
import { LayerIndex } from '@/lib/scene/LayerIndex'
import { rendererRegistry } from '@/lib/registry'
import { planLayerSurfaceRegion } from './planLayerSurfaceRegion'
import { gpuImageEffects } from '../gpu/effects/GPUImageEffects'

beforeEach(()=>vi.spyOn(gpuImageEffects,'supportsRegionBlur').mockReturnValue(true))
afterEach(()=>vi.restoreAllMocks())

/** Pure native-geometry fixture: no DOM or allocated scratch canvas. */
function shape(id = 'host'): Layer {
  return { ...newRectLayer(), id, size: {width:20,height:10}, style:{fill:{type:'solid',color:'#fff'}},
    transform:{x:100,y:80,scaleX:1,scaleY:1,rotationDeg:0,anchorX:0,anchorY:0} }
}
function plan(layer: Layer, others: Layer[] = [], overrides = new Map<string,number>(), large = false) {
  const scene={...emptyScene(),layers:[layer,...others]}
  scene.composition={...scene.composition,width:large?1920:480,height:large?1080:300}
  return planLayerSurfaceRegion({layer,scene,index:new LayerIndex(scene.layers),overrides,timeMs:100,
    context:{filter:'none',globalCompositeOperation:'source-over',shadowColor:'transparent',miterLimit:10,lineWidth:1} as CanvasRenderingContext2D,
    find:item=>rendererRegistry.find(item),effects:effectRegistry})
}

it('keeps large-scene allocation dimensions stable across small animated bounds changes',()=>{
  const host=shape();host.transform.x=100.2;host.transform.y=80.2
  host.effectsChain=[{id:'t',type:'tint',enabled:true,params:{}}]
  const first=plan(host,[],new Map(),true)!
  host.transform.x+=0.25;host.transform.y+=0.25
  expect(plan(host,[],new Map(),true)).toEqual(first)
  expect(first.width%128).toBe(0);expect(first.height%128).toBe(0)
  expect(first.x+first.width).toBeGreaterThan(host.transform.x+host.size!.width)
  host.transform.x+=200
  expect(plan(host,[],new Map(),true)).not.toEqual(first)
})

it('encloses current geometry at integer pixel phase and grows ordered effect support',()=>{
  const host=shape()
  expect(plan(host)).toEqual({x:98,y:78,width:24,height:14})
  host.effectsChain=[{id:'s',type:'shadow',enabled:true,params:{blur:2,offsetX:-5.5,offsetY:2}}]
  const shadow=plan(host)!
  expect(shadow.x).toBeLessThanOrEqual(100-12-6)
  expect(shadow.x+shadow.width).toBeGreaterThanOrEqual(120+12+6)
  host.effectsChain.push({id:'b',type:'blur',enabled:true,params:{radius:4}})
  expect(plan(host)!.width).toBeGreaterThan(shadow.width)
})

it('uses evaluated parent/child transforms and never reuses old bounds after changes',()=>{
  const group={...shape('group'),type:'group' as const}, child={...shape('child'),parentId:group.id}
  const first=plan(group,[child])!
  expect(first.x).toBe(198)
  const next=plan(group,[child],new Map([['layers.group.transform.x',300],['layers.child.transform.scaleX',-2]]))!
  expect(next.x).toBe(358)
  expect(next.width).toBe(44)
  child.size!.width=40
  expect(plan(group,[child])!.width).toBe(44)
})

it('keeps the host domain for inverted/subtract masks and includes feather input',()=>{
  const host=shape(),mask=shape('mask')
  host.masks=[{id:'m',maskLayerId:mask.id,mode:'subtract',inverted:true,feather:4}]
  const region=plan(host,[mask])!
  expect(region.x).toBeLessThanOrEqual(100-24)
  expect(region.width).toBeGreaterThan(24)
  mask.transform.x=1000
  expect(plan(host,[mask])).toEqual(region)
})

it.each(['vignette','innerGlow','innerShadow','unregistered'])('keeps canvas-domain or unknown %s effects full size',type=>{
  const host=shape();host.effectsChain=[{id:'e',type,enabled:true,params:{}}]
  expect(plan(host)).toBeNull()
  host.effectsChain[0].enabled=false
  expect(plan(host)).not.toBeNull()
})

it('falls back for unknown/temporal descendants, bad parameters and cycles',()=>{
  const group={...shape('g'),type:'group' as const},text={...shape('text'),type:'text' as const,parentId:group.id}
  expect(plan(group,[text])).toBeNull()
  const host=shape();host.effectsChain=[{id:'b',type:'blur',enabled:true,params:{radius:Infinity}}]
  expect(plan(host)).toBeNull()
  group.parentId=group.id
  expect(plan(group)).toBeNull()
  host.effectsChain=[];host.motionBlur={enabled:true,baked:false,trailCount:3,frameInterval:20,maxOpacity:0.5,velocityThreshold:0}
  expect(plan(host)).toBeNull()
})

it('clips only at composition edges and falls back for wholly outside content',()=>{
  const host=shape();host.transform.x=-5
  expect(plan(host)?.x).toBe(0)
  host.transform.x=-2000
  expect(plan(host)).toBeNull()
})
