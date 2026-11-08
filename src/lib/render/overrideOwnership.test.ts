import {describe,expect,it} from 'vitest'
import {emptyScene,newRectLayer} from '../defaults'
import type {AnimatableValue,Layer} from '../types'
import {materializeLayerOverrides,materializeRenderScene} from './materializeOverrides'
import {renderSchemas} from './prepareRenderFrame'

/** Probe enumeration rather than timing: multiple sibling tracks should copy
 * one source container once. Frozen sources also reject accidental mutation. */
function counted<T extends object>(value:T){
 let enumerations=0
 const source=new Proxy(Object.freeze(value),{ownKeys:target=>{enumerations++;return Reflect.ownKeys(target)}})
 return {source,count:()=>enumerations}
}

describe('frame-local override copy ownership',()=>{
 it('copies each changed source ancestor once and preserves untouched nested references',()=>{
  const original=newRectLayer(),transform=counted({...original.transform}),source=counted({...original,transform:transform.source})
  const before=JSON.stringify(source.source),frame=materializeLayerOverrides(source.source,new Map([
   [`layers.${original.id}.transform.x`,31],[`layers.${original.id}.transform.y`,47],[`layers.${original.id}.transform.scaleX`,2],
  ]))
  // JSON inspection enumerated source containers once before projection.
  expect(source.count()).toBe(2);expect(transform.count()).toBe(2)
  expect(frame.transform).toMatchObject({x:31,y:47,scaleX:2})
  expect(frame.style).toBe(original.style);expect(frame.size).toBe(original.size)
  expect(JSON.stringify(source.source)).toBe(before)
 })
 it('does not copy anything for same-value and rejected writes',()=>{
  const original=newRectLayer(),transform=counted({...original.transform}),source=counted({...original,transform:transform.source})
  const frame=materializeLayerOverrides(source.source,new Map<string,AnimatableValue>([
   [`layers.${original.id}.transform.x`,original.transform.x],[`layers.${original.id}.transform.scaleX`,'invalid'],
   [`layers.${original.id}.__proto__.polluted`,1],
  ]))
  expect(frame).toBe(source.source);expect(source.count()).toBe(0);expect(transform.count()).toBe(0)
  expect({}).not.toHaveProperty('polluted')
 })
 it('never edits caller payloads, shared source branches or previous frame output',()=>{
  const a=newRectLayer(),b={...a,id:'b'},payload=Object.freeze({x:11,y:22}),scene={...emptyScene(),layers:[a,b]}
  const old=JSON.stringify(scene),frame=materializeRenderScene(scene,new Map<string,AnimatableValue>([
   [`layers.${a.id}.transform`,payload],[`layers.${a.id}.transform.y`,90],['layers.b.transform.x',80],
  ]))
  expect(frame.layers[0].transform).toMatchObject({x:11,y:90})
  expect(frame.layers[1].transform).toMatchObject({x:80,y:a.transform.y})
  expect(frame.layers[0].transform).not.toBe(frame.layers[1].transform)
  expect(payload).toEqual({x:11,y:22});expect(JSON.stringify(scene)).toBe(old)
  const reverse=materializeLayerOverrides(a,new Map<string,AnimatableValue>([
   [`layers.${a.id}.transform.y`,90],[`layers.${a.id}.transform`,payload],
  ]))
  expect(reverse.transform).toMatchObject({x:11,y:22})
  const frozenFrame=JSON.stringify(frame),next=materializeRenderScene(frame,new Map([[`layers.${a.id}.transform.x`,99]]))
  expect(next.layers[0].transform.x).toBe(99);expect(JSON.stringify(frame)).toBe(frozenFrame)
 })
 it('preserves sequential parent/child writes and source alias isolation',()=>{
  const layer=newRectLayer(),shared=Object.freeze({r:1,g:2,b:3,a:1})
  // Legacy extra metadata remains compatible; shared source objects
  // must not become a cross-path mutation channel through a clone lookup cache.
  const custom={...layer,custom:{a:shared,b:shared}} as Layer&{custom:{a:typeof shared;b:typeof shared}}
  const frame=materializeLayerOverrides(custom,new Map<string,AnimatableValue>([
   [`layers.${layer.id}.custom.a.r`,8],[`layers.${layer.id}.custom.a.g`,9],[`layers.${layer.id}.custom.b.b`,7],[`layers.${layer.id}.custom.a.a`,0.5],
  ])) as typeof custom
  expect(frame.custom.a).toEqual({r:8,g:9,b:3,a:0.5});expect(frame.custom.b).toEqual({r:1,g:2,b:7,a:1})
  expect(shared).toEqual({r:1,g:2,b:3,a:1});expect(custom.custom.a).toBe(custom.custom.b)
 })
 it('keeps bounded arrays, ordering and typed/schema coercion behavior across sibling writes',()=>{
  const layer=newRectLayer(),scene={...emptyScene(),layers:[layer]}
  layer.path={closed:false,anchors:[{x:0,y:0},{x:10,y:10}]}
  const source=JSON.stringify(scene)
  const frame=materializeRenderScene(scene,new Map<string,AnimatableValue>([
   [`layers.${layer.id}.path.anchors.0.x`,3],[`layers.${layer.id}.path.anchors.0.y`,4],
   [`layers.${layer.id}.path.anchors.1.x`,12],[`layers.${layer.id}.path.anchors.99999999.y`,7],
   [`layers.${layer.id}.opacity`,2],
  ]),renderSchemas)
  expect(frame.layers[0].path?.anchors).toEqual([{x:3,y:4},{x:12,y:10}])
  expect(frame.layers[0].opacity).toBe(1);expect(layer.path.anchors).toEqual([{x:0,y:0},{x:10,y:10}])
  expect(frame.layers[0].path!.anchors.length).toBe(2);expect(JSON.stringify(scene)).toBe(source)
 })
})

it('preserves legacy noncanonical array-key slice behavior without changing canonical elements',()=>{
 const layer=newRectLayer();layer.path={closed:false,anchors:[{x:0,y:0},{x:10,y:10}]}
 const frame=materializeLayerOverrides(layer,new Map<string,AnimatableValue>([
  [`layers.${layer.id}.path.anchors.0.x`,3],[`layers.${layer.id}.path.anchors.00.x`,9],[`layers.${layer.id}.path.anchors.1.y`,12],
 ]))
 expect(frame.path!.anchors).toEqual([{x:3,y:0},{x:10,y:12}])
 expect(Object.hasOwn(frame.path!.anchors,'00')).toBe(false)
 expect(layer.path.anchors).toEqual([{x:0,y:0},{x:10,y:10}])
})
