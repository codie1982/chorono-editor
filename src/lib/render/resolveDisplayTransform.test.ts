import { describe, expect, it } from 'vitest'
import type { AnimatableValue, ChronoScene, Layer } from '@/lib/types'
import { emptyScene, newSplineLayerFromPrimitive } from '@/lib/defaults'
import { cloneSingleLayer } from '@/lib/clone/CloneSingleLayer'
import { resolveDisplayTransform } from './resolveDisplayTransform'
import { LayerIndex } from '@/lib/scene/LayerIndex'

function layer(id:string, type:Layer['type']='shape'):Layer {
  return {id,name:id,type,opacity:1,transform:{x:0,y:0,scaleX:1,scaleY:1,rotationDeg:0,anchorX:0,anchorY:0}}
}
function scene(...layers:Layer[]):ChronoScene { return {...emptyScene(),layers} }
function follow(path:Layer):Layer {
  return {...layer('follower'),followPath:{pathLayerId:path.id,orientToPath:true}}
}

describe.each([false,true])('follow path rendering (indexed=%s)',indexed=>{
  const displayTransform=(item:Layer,input:ChronoScene,time:number,overrides:Map<string,AnimatableValue>)=>
    resolveDisplayTransform(item,input,time,overrides,undefined,indexed?new LayerIndex(input.layers):undefined)
  it('follows a real spline curve and honours animated progress/rotation/perpendicular offset',()=>{
    const path=newSplineLayerFromPrimitive('line',{x1:0,y1:0,x2:100,y2:0})!
    path.transform={...path.transform,x:10,y:20}
    const ball=follow(path)
    const display=displayTransform(ball,scene(path,ball),500,new Map<string,AnimatableValue>([
      ['layers.follower.followPath.progress',0.25],
      ['layers.follower.followPath.rotationOffset',15],
      ['layers.follower.followPath.perpendicularOffset',10],
    ]))
    expect(display.x).toBeCloseTo(35)
    expect(display.y).toBeCloseTo(10)
    expect(display.rotationDeg).toBeCloseTo(15)
  })

  it('keeps pivots, nonuniform scale and distinct parent chains in the same coordinate space',()=>{
    const parent={...layer('path-parent','group'),transform:{...layer('').transform,x:100,y:200,rotationDeg:90}}
    const path=newSplineLayerFromPrimitive('line',{x1:0,y1:0,x2:100,y2:0})!
    path.parentId=parent.id
    path.transform={x:10,y:20,scaleX:2,scaleY:3,rotationDeg:0,anchorX:10,anchorY:0}
    const ball=follow(path)
    const ballParent={...layer('follower-parent','group'),transform:{...layer('').transform,x:20,y:10}}
    ball.parentId=ballParent.id
    const result=displayTransform(ball,scene(parent,path,ballParent,ball),0,
      new Map([['layers.follower.followPath.progress',0.5]]))
    // (50,0) → pivoted scale/translate (100,20) → parent (80,300)
    // → follower-parent local coordinates (60,290).
    expect(result.x).toBeCloseTo(60)
    expect(result.y).toBeCloseTo(290)
    expect(result.rotationDeg).toBeCloseTo(90)
  })

  it('reads spline point/control keyframes and a path instance independently from its source transform',()=>{
    const source=newSplineLayerFromPrimitive('line',{x1:0,y1:0,x2:100,y2:0})!
    source.transform.x=500
    const {clonedLayer:path}=cloneSingleLayer(source,{mode:'instance',offsetX:100})
    path.transform.y=0
    const ball=follow(path)
    const point=Object.keys(source.spline!.points)[1]
    const result=displayTransform(ball,scene(source,path,ball),0,new Map([
      [`layers.${path.id}.spline.points.${point}.x`,200],
      ['layers.follower.followPath.progress',0.5],
    ]))
    expect(result.x).toBeCloseTo(700)
    expect(result.y).toBeCloseTo(0)
    expect(source.spline!.points[point].x).toBe(100)
  })

  it('continues to follow Bezier paths and tolerates cyclic references and singular parents',()=>{
    const path={...layer('path','path'),path:{closed:false,anchors:[{x:0,y:0},{x:120,y:60}]}}
    const ball=follow(path)
    expect(displayTransform(ball,scene(path,ball),0,new Map([['layers.follower.followPath.progress',1]])))
      .toMatchObject({x:120,y:60})
    path.followPath={pathLayerId:ball.id}
    expect(()=>displayTransform(ball,scene(path,ball),0,new Map())).not.toThrow()
    const parent=layer('parent','group'); parent.transform.scaleX=0; ball.parentId=parent.id
    expect(()=>displayTransform(ball,scene(parent,path,ball),0,new Map())).not.toThrow()
  })
})
