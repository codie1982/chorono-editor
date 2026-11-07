import { describe, expect, it } from 'vitest'
import type { Layer } from '@/lib/types'
import { emptyScene, newParticleEmitterLayer, newSplineLayerFromPrimitive } from '@/lib/defaults'
import { pathFromPoints } from '@/lib/types/path'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { resolveEmissionGeometry, type SourceLayerContext } from '../runtime/EmissionGeometry'
import { computeSpawnParams } from '../runtime/ParticleSpawner'

const layer = (id:string,type:Layer['type'],patch:Partial<Layer>={}):Layer => ({
  id,name:id,type,opacity:1,transform:{x:0,y:0,anchorX:0,anchorY:0,scaleX:1,scaleY:1,rotationDeg:0},...patch,
})
function fixture() {
  const parent=layer('guide-parent','group')
  parent.transform={...parent.transform,x:100,y:200,rotationDeg:90}
  const guide=layer('guide','path',{parentId:parent.id,path:pathFromPoints([[0,0],[100,0]],false)})
  guide.transform={...guide.transform,x:10,y:5}
  const emitterParent=layer('emitter-parent','group')
  emitterParent.transform={...emitterParent.transform,x:-20,y:40,rotationDeg:-30,scaleX:2,scaleY:2}
  const emitter=newParticleEmitterLayer();emitter.id='emitter';emitter.parentId=emitterParent.id
  emitter.transform={...emitter.transform,x:10,y:0,anchorX:0,anchorY:0}
  const scene={...emptyScene(),layers:[parent,guide,emitterParent,emitter]}
  const context:SourceLayerContext={allLayers:scene.layers,scene,particleLayerId:emitter.id,particleLayerX:10,particleLayerY:0,timeMs:500,overrides:new Map()}
  const emitterWorld=Matrix2D.identity().translate(-20,40).rotate(-30).scale(2,2).translate(10,0)
  const cfg=emitter.particleEmitter!
  cfg.emitter={mode:'burst',shape:'path',area:{pathLayerId:guide.id},burstCount:20,maxParticles:20,durationMs:2000,loop:false}
  cfg.animation={lifetimeMs:{min:2000,max:2000}}
  cfg.random={...cfg.random,seed:42,positionRandomness:0,delayRandomness:0,lifetimeRandomness:0}
  return {guide,parent,emitter,scene,context,emitterWorld,cfg}
}

describe('particle emission from editable scene geometry',()=>{
  it('samples a path in emitter-local space across different rotated/scaled parents',()=>{
    const {context,cfg,emitterWorld}=fixture()
    const sample=resolveEmissionGeometry(context,cfg.emitter)!
    const point=emitterWorld.applyToPoint(sample(.25,.7))
    expect(point.x).toBeCloseTo(95)
    expect(point.y).toBeCloseTo(235)
    const particles=computeSpawnParams(cfg,500,undefined,context)
    expect(particles).toHaveLength(20)
    const points=particles.map(p=>emitterWorld.applyToPoint(p.basePosition))
    expect(points.every(p=>Math.abs(p.x-95)<1e-8 && p.y>=210 && p.y<=310)).toBe(true)
    expect(new Set(points.map(p=>p.y)).size).toBeGreaterThan(10)
  })
  it('reads animated spline point coordinates rather than falling back to the emitter origin',()=>{
    const {context,cfg,scene}=fixture()
    const spline=newSplineLayerFromPrimitive('line',{x1:0,y1:0,x2:100,y2:0})!
    spline.id='spline';spline.transform={x:0,y:0,anchorX:0,anchorY:0,scaleX:1,scaleY:1,rotationDeg:0}
    const point=Object.values(spline.spline!.points).find(point=>point.x===100)!
    scene.layers.push(spline)
    context.allLayers=scene.layers
    context.particleLayerId=undefined;context.scene=undefined;context.particleLayerX=0;context.particleLayerY=0
    context.overrides=new Map([[`layers.${spline.id}.spline.points.${point.id}.y`,100]])
    cfg.emitter.area={pathLayerId:spline.id}
    expect(resolveEmissionGeometry(context,cfg.emitter)!(1,.5)).toMatchObject({x:100,y:100})
    expect(point.y).toBe(0)
  })
  it('samples transformed source-layer bounds and perimeter in the exact parent basis',()=>{
    const {context,cfg,emitterWorld,guide}=fixture()
    guide.type='shape';guide.shapeKind='rect';guide.size={width:100,height:40}
    cfg.emitter.shape='sourceLayer';cfg.emitter.area={sourceLayerId:guide.id,emitFromEdge:true}
    const sourceWorld=Matrix2D.identity().translate(100,200).rotate(90).translate(10,5)
    const sample=resolveEmissionGeometry(context,cfg.emitter)!
    for(const u of [.05,.2,.4,.7,.95]) {
      const point=sourceWorld.invert().applyToPoint(emitterWorld.applyToPoint(sample(u,.3)))
      expect(point.x).toBeGreaterThanOrEqual(-1e-8);expect(point.x).toBeLessThanOrEqual(100+1e-8)
      expect(point.y).toBeGreaterThanOrEqual(-1e-8);expect(point.y).toBeLessThanOrEqual(40+1e-8)
      expect(Math.min(Math.abs(point.x),Math.abs(point.x-100),Math.abs(point.y),Math.abs(point.y-40))).toBeLessThan(1e-8)
    }
  })
  it('keeps every post-position RNG field stable when path emission replaces a line emitter',()=>{
    const {context,cfg}=fixture()
    const paths=computeSpawnParams(cfg,500,undefined,context)
    const lines=computeSpawnParams({...cfg,emitter:{...cfg.emitter,shape:'line',area:{lineStart:{x:0,y:0},lineEnd:{x:100,y:0}}}},500)
    const stable=(p:typeof paths[number])=>[p.id,p.birthTimeMs,p.lifetimeMs,p.baseSize,p.baseRotation,p.rotationVelocity,p.baseColor,p.seedPhase,p.positionTarget]
    expect(paths.map(stable)).toEqual(lines.map(stable))
  })
  it('handles missing references and singular emitter transforms without nonfinite spawn coordinates',()=>{
    const {context,cfg,emitter}=fixture()
    expect(resolveEmissionGeometry(context,{...cfg.emitter,area:{pathLayerId:'missing'}})).toBeUndefined()
    emitter.transform.scaleX=0
    expect(resolveEmissionGeometry(context,cfg.emitter)).toBeUndefined()
    expect(computeSpawnParams(cfg,500,undefined,context).every(p=>Number.isFinite(p.basePosition.x)&&Number.isFinite(p.basePosition.y))).toBe(true)
  })
})
