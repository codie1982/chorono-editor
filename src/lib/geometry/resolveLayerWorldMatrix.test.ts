import { describe, expect, it } from 'vitest'
import { emptyScene, newSplineLayerFromPrimitive } from '@/lib/defaults'
import { createLayerWorldMatrixResolver, resolveLayerWorldMatrix } from './resolveLayerWorldMatrix'
import { LayerIndex } from '@/lib/scene/LayerIndex'

describe.each([false,true])('resolveLayerWorldMatrix (indexed=%s)', indexed => {
  it('uses parent rotation and anchor-centered layer rotation/scale', () => {
    const scene = emptyScene()
    const parent = newSplineLayerFromPrimitive('circle', { radius: 10 })!
    parent.type = 'group'
    parent.transform = { x: 200, y: 50, anchorX: 0, anchorY: 0, rotationDeg: 90, scaleX: 1, scaleY: 1 }
    const child = newSplineLayerFromPrimitive('circle', { radius: 10 })!
    child.parentId = parent.id
    child.transform = { x: 100, y: 70, anchorX: 10, anchorY: 20, rotationDeg: 90, scaleX: 2, scaleY: 3 }
    scene.layers = [parent, child]
    const matrix = resolveLayerWorldMatrix(child, scene, 0, undefined, indexed ? new LayerIndex(scene.layers) : undefined)
    const point = matrix.applyToPoint({ x: 12, y: 25 })
    expect(point.x).toBeCloseTo(106)
    expect(point.y).toBeCloseTo(145)
    const local = matrix.invert().applyToPoint(point)
    expect(local.x).toBeCloseTo(12)
    expect(local.y).toBeCloseTo(25)
  })

  it('uses animated transforms for the child and its parent', () => {
    const scene = emptyScene()
    const parent = newSplineLayerFromPrimitive('circle', { radius: 10 })!
    parent.type = 'group'
    parent.transform = { x: 0, y: 0, anchorX: 0, anchorY: 0, rotationDeg: 0, scaleX: 1, scaleY: 1 }
    const child = newSplineLayerFromPrimitive('circle', { radius: 10 })!
    child.parentId = parent.id
    child.transform = { ...parent.transform }
    scene.layers = [parent, child]
    const overrides = new Map([
      [`layers.${parent.id}.transform.x`, 300],
      [`layers.${parent.id}.transform.rotationDeg`, 90],
      [`layers.${child.id}.transform.y`, 50],
      [`layers.${child.id}.transform.scaleX`, -2],
    ])
    const point = resolveLayerWorldMatrix(child, scene, 1000, overrides,
      indexed ? new LayerIndex(scene.layers) : undefined).applyToPoint({ x: 10, y: 0 })
    expect(point.x).toBeCloseTo(250)
    expect(point.y).toBeCloseTo(-20)
  })
})

it('shares immutable parent prefixes with exact standalone matrix values and one read per parent',()=>{
  const scene=emptyScene(),parent=newSplineLayerFromPrimitive('circle',{radius:10})!
  parent.transform={x:13.25,y:-9.5,anchorX:7.25,anchorY:3,rotationDeg:17.5,scaleX:1.17,scaleY:-0.83}
  const children=Array.from({length:100},(_,i)=>({...parent,id:`child${i}`,parentId:parent.id,
    transform:{...parent.transform,x:i+0.1,y:i*0.3}}))
  scene.layers=[parent,...children]
  const index=new LayerIndex(scene.layers),overrides=new Map<string,number>()
  const expected=children.map(child=>resolveLayerWorldMatrix(child,scene,13,overrides,index).toArray())
  let reads=0
  const transform=parent.transform
  Object.defineProperty(parent,'transform',{get(){reads++;return transform},configurable:true})
  const resolve=createLayerWorldMatrixResolver(scene,13,overrides,index)
  expect(children.map(child=>resolve(child).toArray())).toEqual(expected)
  expect(reads).toBeLessThan(10)
  const again=resolve(children[0]);expect(resolve(children[0])).toBe(again)
})

it('preserves standalone cycle and effective-clone semantics regardless of query order',()=>{
  const scene=emptyScene(),a=newSplineLayerFromPrimitive('circle',{radius:10})!,b={...a,id:'b',parentId:a.id,transform:{...a.transform,x:53}}
  scene.layers=[a,b]
  const index=new LayerIndex(scene.layers),resolve=createLayerWorldMatrixResolver(scene,0,new Map(),index)
  resolve(b)
  const clone={...a,parentId:b.id,transform:{...a.transform,y:88}}
  expect(resolve(clone).toArray()).toEqual(resolveLayerWorldMatrix(clone,scene,0,new Map(),index).toArray())
  a.parentId=b.id
  const cyclic=createLayerWorldMatrixResolver(scene,0,new Map(),index)
  for(const layer of [a,b,a,b])expect(cyclic(layer).toArray()).toEqual(resolveLayerWorldMatrix(layer,scene,0,new Map(),index).toArray())
})

it('takes a fresh frame for time, ancestor edits and reparenting',()=>{
  const scene=emptyScene(),a=newSplineLayerFromPrimitive('circle',{radius:10})!,b={...a,id:'b',parentId:a.id}
  scene.layers=[a,b]
  const before=createLayerWorldMatrixResolver(scene,0,new Map())(b)
  a.transform={...a.transform,x:a.transform.x+35}
  const after=createLayerWorldMatrixResolver(scene,10,new Map([[`layers.${b.id}.transform.y`,50]]))(b)
  expect(after.toArray()).toEqual(resolveLayerWorldMatrix(b,scene,10,new Map([[`layers.${b.id}.transform.y`,50]])).toArray())
  expect(after.toArray()).not.toEqual(before.toArray())
  b.parentId=''
  expect(createLayerWorldMatrixResolver(scene,10)(b).toArray()).toEqual(resolveLayerWorldMatrix(b,scene,10).toArray())
})
