import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newSplineLayerFromPrimitive } from '@/lib/defaults'
import type { Layer } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { cloneSingleLayer } from '@/lib/clone/CloneSingleLayer'
import { splineToPathDefinition } from '@/lib/spline/splineToPath'
import { SplineHandle } from './SplineHandle'
import { assertSplineTopology } from './splineHandleData'

function setup(layer=newSplineLayerFromPrimitive('rectangle',{width:100,height:60})!,others:Layer[]=[]) {
  let scene={...emptyScene(),layers:[layer,...others]}
  const commands:EditorCommand[]=[]
  const handle=new SplineHandle(layer.id,{host:{getScene:()=>scene,applyCommand:command=>{
    commands.push(command);scene=command.execute(scene)
  }},resolveTimelineId:()=>undefined})
  return {handle,commands,getScene:()=>scene,getLayer:()=>scene.layers.find(item=>item.id===layer.id)!,
    undo:()=>{scene=commands[commands.length-1].undo(scene)},
    redo:()=>{scene=commands[commands.length-1].execute(scene)},
    setScene:(next:typeof scene)=>{scene=next}}
}
const line=()=>newSplineLayerFromPrimitive('line',{x1:0,y1:0,x2:100,y2:0})!
const first=<T>(record:Record<string,T>)=>Object.values(record)[0]

describe('SplineHandle reads and command integration',()=>{
  it('returns detached normalized geometry, element reads and local bounds',()=>{
    const {handle,getLayer,commands}=setup()
    const data=handle.data,point=first(data.points),contour=first(data.contours),sub=first(data.subShapes),segment=first(data.segments)
    data.points[point.id].x=999
    const read=handle.getPoint(point.id)!;read.x=888
    handle.getContour(contour.id)!.pointIds.length=0
    handle.getSubShape(sub.id)!.name='changed'
    handle.getSegment(segment.id)!.fromPointId='missing'
    expect(getLayer().spline!.points[point.id].x).toBe(-50)
    expect(handle.getPoint('missing')).toBeNull()
    expect(handle.getPoint('constructor')).toBeNull()
    expect(handle.getContour('__proto__')).toBeNull()
    expect(handle.bounds).toEqual({x:-50,y:-30,width:100,height:60})
    expect(commands).toHaveLength(0)
  })

  it('appends a native primitive with stable returned ids as one undoable command and preserves the layer pivot/parent/style',()=>{
    const layer=line();layer.parentId='parent';layer.transform={...layer.transform,anchorX:17,anchorY:-9,rotationDeg:37}
    const parent={...newRectLayer(),id:'parent',type:'group' as const}
    const {handle,getLayer,commands,undo,redo}=setup(layer,[parent])
    const before=structuredClone(layer)
    const ids=handle.appendPrimitive('circle',{radius:20},{x:200,y:40,name:'Orbit'})
    expect(ids.subShapeIds).toHaveLength(1)
    expect(ids.pointIds).toHaveLength(4)
    expect(handle.getSubShape(ids.subShapeIds[0])!.name).toBe('Orbit')
    expect(getLayer().transform).toEqual(before.transform)
    expect(getLayer().parentId).toBe('parent')
    expect(getLayer().style).toEqual(before.style)
    expect(handle.bounds).toEqual({x:0,y:0,width:220,height:60})
    expect(commands).toHaveLength(1)
    const applied=handle.data
    undo();expect(getLayer()).toEqual(before)
    redo();expect(handle.data).toEqual(applied)
  })

  it('reads instance source geometry without permitting implicit writes to the source',()=>{
    const source=line()
    const {clonedLayer:instance}=cloneSingleLayer(source,{mode:'instance',offsetX:200})
    const {handle,getScene,commands}=setup(instance,[source])
    const point=first(handle.data.points)
    expect(handle.layerId).toBe(instance.id)
    expect(handle.getPoint(point.id)).toEqual(point)
    expect(handle.bounds.width).toBe(100)
    expect(()=>handle.movePoint(point.id,1,2)).toThrow(source.id)
    expect(()=>handle.appendPrimitive('circle',{radius:20})).toThrow(/read-only/)
    expect(getScene().layers.find(layer=>layer.id===source.id)!.spline!.points[point.id]).toEqual(point)
    expect(commands).toHaveLength(0)
  })
})

describe('SplineHandle normalized geometry edits',()=>{
  it('adds an editable contour under an existing sub-shape, appends/splits points and preserves connectivity',()=>{
    const {handle,commands}=setup(line())
    const owner=first(handle.data.subShapes)
    const ids=handle.addContour([{x:200,y:0},{x:300,y:0}],{subShapeId:owner.id,name:'extra'})
    expect(ids.subShapeIds).toEqual([owner.id])
    const tail=handle.addPoint(ids.contourIds[0],{x:320,y:30})
    const middle=handle.addPoint(ids.contourIds[0],{x:250,y:40},{afterPointId:ids.pointIds[0]})
    expect(handle.getContour(ids.contourIds[0])!.pointIds).toEqual([ids.pointIds[0],middle,ids.pointIds[1],tail])
    expect(handle.getSubShape(owner.id)).toMatchObject({source:'edited',editable:true})
    assertSplineTopology(handle.data)
    expect(commands).toHaveLength(3)
  })

  it('keeps cubic handle continuity and moves attached handles rigidly with their anchor',()=>{
    const {handle}=setup(line())
    const point=first(handle.data.points)
    handle.setPointType(point.id,'bezier')
    const out=handle.setHandle(point.id,'out',{x:40,y:20})
    let incoming=Object.values(handle.data.handles).find(item=>item.pointId===point.id&&item.kind==='in')!
    expect(incoming).toMatchObject({x:-40,y:-20})
    handle.movePoint(point.id,10,30)
    expect(handle.getHandle(out)).toMatchObject({x:50,y:50})
    incoming=handle.getHandle(incoming.id)!
    expect(incoming).toMatchObject({x:-30,y:10})
    expect(Object.values(handle.data.segments)[0].type).toBe('cubic')
    handle.removeHandle(point.id,'out')
    expect(handle.getHandle(out)).toBeNull()
    assertSplineTopology(handle.data)
  })

  it('builds custom cubic contours from plain anchors with canonical independent handles',()=>{
    const {handle}=setup(line())
    const ids=handle.addContour([{x:0,y:0,out:{x:30,y:80}},{x:100,y:0,in:{x:70,y:80}}],{name:'Arch'})
    expect(handle.getPoint(ids.pointIds[0])!.type).toBe('bezierCorner')
    expect(handle.getSegment(ids.segmentIds[0])!.type).toBe('cubic')
    expect(ids.handleIds).toHaveLength(2)
    assertSplineTopology(handle.data)
    expect(()=>handle.addContour([{x:0,y:0,type:'corner',out:{x:10,y:20}},{x:30,y:0}])).toThrow(/Corner/)
  })

  it('splits cubic and quadratic segments through native De Casteljau mutations',()=>{
    const {handle}=setup(line()),segment=first(handle.data.segments)
    handle.setSegmentType(segment.id,'cubic')
    handle.setHandle(segment.fromPointId,'out',{x:0,y:100})
    handle.setHandle(segment.toPointId,'in',{x:100,y:100})
    const split=handle.splitSegment(segment.id,0.25)
    expect(split.segmentIds).toHaveLength(2)
    expect(handle.getPoint(split.pointId)).toMatchObject({x:15.625,y:56.25})
    expect(handle.getSegment(segment.id)).toBeNull()
    const right=split.segmentIds[1]
    handle.setQuadraticControl(right,{x:80,y:120})
    const quadratic=handle.getSegment(right)!,from=handle.getPoint(quadratic.fromPointId)!,to=handle.getPoint(quadratic.toPointId)!
    const inserted=handle.splitSegment(right,0.5)
    expect(handle.getPoint(inserted.pointId)!.x).toBeCloseTo(from.x*0.25+80*0.5+to.x*0.25)
    expect(handle.getPoint(inserted.pointId)!.y).toBeCloseTo(from.y*0.25+120*0.5+to.y*0.25)
    expect(inserted.segmentIds.map(id=>handle.getSegment(id)!.type)).toEqual(['quadratic','quadratic'])
    assertSplineTopology(handle.data)
  })

  it('closes, reverses and opens a contour while maintaining the normalized closing edge',()=>{
    const {handle}=setup(line()),contour=first(handle.data.contours)
    handle.addPoint(contour.id,{x:100,y:80})
    handle.setContourClosed(contour.id,true)
    handle.reverseContour(contour.id)
    assertSplineTopology(handle.data)
    const reversed=handle.getContour(contour.id)!
    expect(handle.getSegment(reversed.segmentIds.at(-1)!)!.toPointId).toBe(reversed.pointIds[0])
    handle.setContourClosed(contour.id,false)
    assertSplineTopology(handle.data)
    expect(handle.getContour(contour.id)!.segmentIds).toHaveLength(2)
  })

  it('transforms only the requested sub-shape with all canonical controls and preserves unrelated geometry',()=>{
    const {handle,getLayer}=setup(line()),before=handle.data
    const added=handle.appendPrimitive('circle',{radius:10})
    const selected=added.subShapeIds[0]
    const initial=handle.getPoint(added.pointIds[0])!,control=handle.getHandle(added.handleIds[0])!
    const transform=structuredClone(getLayer().transform)
    handle.transform({a:2,b:0,c:0,d:3,e:50,f:-20},{subShapeId:selected})
    expect(handle.getPoint(initial.id)).toMatchObject({x:initial.x*2+50,y:initial.y*3-20})
    expect(handle.getHandle(control.id)).toMatchObject({x:control.x*2+50,y:control.y*3-20})
    expect(handle.getPoint(first(before.points).id)).toEqual(first(before.points))
    expect(getLayer().transform).toEqual(transform)
  })

  it('removes topology and matching animation tracks atomically, restoring all records and key identities on undo',()=>{
    const {handle,getScene,setScene,commands,undo}=setup()
    const point=first(handle.data.points)
    const target=`layers.${handle.layerId}.spline.points.${point.id}.x`
    const unrelated=`layers.${handle.layerId}.opacity`
    const key={id:'identity',timeMs:0,value:1,easing:{type:'linear' as const}}
    setScene({...getScene(),timelines:[{id:'motion',durationMs:1000,autoplay:true,loop:false,tracks:[
      {target,keyframes:[key]},{target:unrelated,keyframes:[{...key,id:'keep'}]},
    ]}]})
    const before=structuredClone(getScene())
    handle.removePoint(point.id)
    expect(getScene().timelines[0].tracks.map(track=>track.target)).toEqual([unrelated])
    expect(handle.getPoint(point.id)).toBeNull()
    expect(commands).toHaveLength(1)
    assertSplineTopology(handle.data)
    undo();expect(getScene()).toEqual(before)
  })

  it('removes complete contours/sub-shapes without orphaned handles or contour owners',()=>{
    const {handle}=setup()
    const ids=handle.appendPrimitive('donut',{outerRadius:60,innerRadius:30})
    handle.removeContour(ids.contourIds[0])
    expect(handle.getSubShape(ids.subShapeIds[0])!.contourIds).toHaveLength(1)
    handle.removeSubShape(ids.subShapeIds[0])
    expect(handle.getSubShape(ids.subShapeIds[0])).toBeNull()
    const remaining=first(handle.data.subShapes)
    handle.setSubShape(remaining.id,{name:'Renamed'})
    handle.setFillRule('evenodd')
    expect(handle.getSubShape(remaining.id)!.name).toBe('Renamed')
    handle.removeSubShape(remaining.id)
    expect(splineToPathDefinition(handle.data).commands).toHaveLength(0)
    expect(handle.bounds).toEqual({x:0,y:0,width:0,height:0})
    assertSplineTopology(handle.data)
  })
})

describe('SplineHandle invalid edits and locks',()=>{
  it('rejects locked points/handles, including indirect changes from transforms or segment splits',()=>{
    const {handle,commands}=setup(line()),point=first(handle.data.points)
    const out=handle.setHandle(point.id,'out',{x:20,y:50})
    handle.setHandleLocked(out,true)
    const before=handle.data,count=commands.length
    expect(()=>handle.movePoint(point.id,20,30)).toThrow(/locked/)
    expect(()=>handle.splitSegment(first(before.segments).id,0.4)).toThrow(/locked/)
    expect(()=>handle.setHandle(point.id,'out',{x:30,y:30,locked:false})).toThrow(/locked/)
    expect(handle.data).toEqual(before)
    expect(commands).toHaveLength(count)
    handle.setHandleLocked(out,false)
    handle.setPointLocked(point.id,true)
    expect(()=>handle.transform({a:1,b:0,c:0,d:1,e:10,f:0})).toThrow(/locked/)
    handle.setPointLocked(point.id,false)
    handle.movePoint(point.id,5,6)
    expect(handle.getPoint(point.id)).toMatchObject({x:5,y:6})
  })

  it('guards layer type, inherited layer locks, unknown ids, invalid coordinates, bounded generator allocations and unsupported primitives',()=>{
    const layer=line(),parent={...newRectLayer(),id:'parent',locked:true}
    layer.parentId=parent.id
    const locked=setup(layer,[parent]),point=first(layer.spline!.points)
    expect(locked.handle.data).toBeDefined()
    expect(()=>locked.handle.movePoint(point.id,0,0)).toThrow(/locked/)
    expect(locked.commands).toHaveLength(0)
    const invalid=setup(newRectLayer())
    expect(()=>invalid.handle.data).toThrow(/not an editable spline/)
    const {handle,commands}=setup(line())
    const before=handle.data
    expect(()=>handle.movePoint('missing',1,2)).toThrow(/not found/)
    expect(()=>handle.movePoint(first(before.points).id,NaN,2)).toThrow(/finite/)
    expect(()=>handle.appendPrimitive('star',{points:1000000000,outerRadius:10,innerRadius:5})).toThrow(/count/)
    expect(()=>handle.appendPrimitive('helix',{turns:3,startRadius:2,endRadius:20})).toThrow(/not implemented/)
    expect(()=>handle.splitSegment(first(before.segments).id,0)).toThrow(/between/)
    expect(()=>handle.removePoint(first(before.points).id)).toThrow(/removeContour/)
    expect(handle.data).toEqual(before)
    expect(commands).toHaveLength(0)
  })
})
