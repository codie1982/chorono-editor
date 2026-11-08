import type { Layer } from '@/lib/types'
import type { SplineContour, SplineGeneratorParams, SplineHandle as HandleData, SplinePathData,
  SplinePoint, SplinePointType, SplinePrimitiveKind, SplineSegment, SplineSubShape } from '@/lib/types/spline'
import type { ApiContext } from './LayerHandle'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { moveSplinePoint, moveSplineHandle, insertPointOnSegment, deleteSplinePoint,
  setSplinePointType, setSegmentType, setContourClosed, reverseContour } from '@/lib/spline/edit/mutations'
import { createSplinePrimitive } from '@/lib/spline/factory/createSplinePrimitive'
import { mergeSplineData } from '@/lib/spline/factory/mergeSplineData'
import { buildSplineData, type AnchorSpec } from '@/lib/spline/util/buildSplineData'
import { transformSplineData } from '@/lib/spline/geometry/transformSplineData'
import { computeSplineBounds } from '@/lib/spline/geometry/computeSplineBounds'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { resolveInstanceLayer } from '@/lib/clone/InstanceResolver'
import { uid } from '@/lib/spline/util/uid'
import { copyScriptData, assertSafeScriptData } from './scriptData'
import { assertBoolean, assertCoordinates, assertPointType, assertSplineLocks,
  assertSplineTopology, markEditedSubShapes } from './splineHandleData'

export interface SplineElementIds { subShapeIds: string[]; contourIds: string[]; pointIds: string[]; handleIds: string[]; segmentIds: string[] }
export interface SplineAnchorInput { x: number; y: number; type?: SplinePointType; in?: {x:number;y:number}; out?: {x:number;y:number} }
export interface SplineAffineTransform { a:number; b:number; c:number; d:number; e:number; f:number }
const recordNames = ['subShapes', 'contours', 'points', 'handles', 'segments'] as const
const resultNames = ['subShapeIds', 'contourIds', 'pointIds', 'handleIds', 'segmentIds'] as const

function elementIds(data: SplinePathData): SplineElementIds {
  return { subShapeIds:Object.keys(data.subShapes), contourIds:Object.keys(data.contours), pointIds:Object.keys(data.points),
    handleIds:Object.keys(data.handles), segmentIds:Object.keys(data.segments) }
}
function newElementIds(before: SplinePathData, after: SplinePathData): SplineElementIds {
  const result = elementIds(after)
  recordNames.forEach((record, index) => { result[resultNames[index]] = result[resultNames[index]].filter(id => !before[record][id]) })
  return result
}
function without<T>(record: Record<string,T>, removed: Set<string>): Record<string,T> {
  return Object.fromEntries(Object.entries(record).filter(([id]) => !removed.has(id)))
}
function handleFor(data: SplinePathData, pointId:string, kind:'in'|'out') {
  return Object.values(data.handles).find(handle => handle.pointId === pointId && handle.kind === kind)
}
function own<T>(record:Record<string,T>,id:string):T|undefined {
  return typeof id==='string'&&Object.prototype.hasOwnProperty.call(record,id)?record[id]:undefined
}

/** Script-facing normalized spline editor. Coordinates/matrices are layer-local;
 * geometry changes preserve the layer's transform, pivot, parent and size. */
export class SplineHandle {
  constructor(public readonly layerId: string, private readonly ctx: ApiContext) {}
  get id(): string { return this.layerId }

  private layer(edit = false): Layer & {spline:SplinePathData} {
    const scene = this.ctx.host.getScene()
    const original = scene.layers.find(item => item.id === this.layerId)
    if (edit && original?.instanceOf) throw new Error(`Spline instance '${this.layerId}' is read-only. Edit source layer '${original.instanceOf}' explicitly.`)
    const layer = original && (edit ? original : resolveInstanceLayer(original, scene.layers))
    if (!layer || layer.type !== 'spline' || !layer.spline) throw new Error(`Layer '${this.layerId}' is not an editable spline.`)
    if (edit) {
      let item:Layer|undefined=layer
      const seen=new Set<string>()
      while (item) {
        if (seen.has(item.id)) throw new Error('Cyclic spline parent relationship.')
        seen.add(item.id)
        if (item.locked || item.frozen) throw new Error(`Spline layer '${item.id}' is locked or frozen.`)
        const parentId:string|undefined=item.parentId
        item=parentId ? scene.layers.find(candidate=>candidate.id===parentId) : undefined
      }
    }
    return layer as Layer & {spline:SplinePathData}
  }
  get data(): SplinePathData { return copyScriptData(this.layer().spline) }
  get bounds() { return computeSplineBounds(this.layer().spline) }
  getPoint(id:string):SplinePoint|null { return copyScriptData(own(this.layer().spline.points,id) ?? null) }
  getHandle(id:string):HandleData|null { return copyScriptData(own(this.layer().spline.handles,id) ?? null) }
  getSegment(id:string):SplineSegment|null { return copyScriptData(own(this.layer().spline.segments,id) ?? null) }
  getContour(id:string):SplineContour|null { return copyScriptData(own(this.layer().spline.contours,id) ?? null) }
  getSubShape(id:string):SplineSubShape|null { return copyScriptData(own(this.layer().spline.subShapes,id) ?? null) }

  private edit<T>(label:string, mutate:(data:SplinePathData)=>{data:SplinePathData;result:T}, options:{unlock?:string;markEdited?:boolean}={}):T {
    const layer=this.layer(true), before=layer.spline
    const output=mutate(before)
    if (output.data === before) return output.result
    assertSplineLocks(before,output.data,options.unlock)
    const next=options.markEdited === false ? output.data : markEditedSubShapes(before,output.data)
    assertSplineTopology(next)
    const command=makeUpdateLayerCmd(this.layerId,{spline:next},layer)
    const removed:string[]=[]
    for (const record of recordNames) for (const id of Object.keys(before[record])) {
      if (!next[record][id]) removed.push(`layers.${this.layerId}.spline.${record}.${id}`)
    }
    const previousTimelines=this.ctx.host.getScene().timelines
    this.ctx.host.applyCommand({
      label:`Spline: ${label}`,
      execute:scene=>{
        const updated=command.execute(scene)
        return removed.length ? {...updated,timelines:updated.timelines.map(timeline=>({...timeline,
          tracks:timeline.tracks.filter(track=>!removed.some(prefix=>track.target===prefix||track.target.startsWith(prefix+'.'))),
        }))} : updated
      },
      undo:scene=>({...command.undo(scene),...(removed.length?{timelines:previousTimelines}:{})}),
    })
    return copyScriptData(output.result)
  }
  private point(data:SplinePathData,id:string) {
    const point=own(data.points,id); if (!point) throw new Error(`Spline point '${id}' not found.`); return point
  }
  private contour(data:SplinePathData,id:string) {
    const contour=own(data.contours,id); if (!contour) throw new Error(`Spline contour '${id}' not found.`); return contour
  }
  private segment(data:SplinePathData,id:string) {
    const segment=own(data.segments,id); if (!segment) throw new Error(`Spline segment '${id}' not found.`); return segment
  }

  appendPrimitive(kind:SplinePrimitiveKind,params:SplineGeneratorParams,options:{x?:number;y?:number;name?:string}={}):SplineElementIds {
    this.layer(true)
    assertSafeScriptData(params); assertCoordinates(options.x??0,options.y??0)
    const counts=params as unknown as Record<string,unknown>
    for (const key of ['sides','points']) if (counts[key] !== undefined) {
      if (typeof counts[key] !== 'number'||!Number.isInteger(counts[key])||(counts[key] as number)<3||(counts[key] as number)>1000) throw new Error('Spline primitive count must be an integer from 3 to 1000.')
    }
    const generated=createSplinePrimitive({kind,params:copyScriptData(params)})
    if (!generated) throw new Error(`Spline primitive '${kind}' is not implemented.`)
    let incoming=transformSplineData(generated,Matrix2D.translation(options.x??0,options.y??0))
    if (options.name !== undefined) {
      if (typeof options.name !== 'string') throw new Error('Spline sub-shape name must be a string.')
      incoming={...incoming,subShapes:Object.fromEntries(Object.entries(incoming.subShapes).map(([id,sub])=>[id,{...sub,name:options.name!}]))}
    }
    assertSplineTopology(incoming)
    return this.edit('Append primitive',data=>({data:mergeSplineData(data,incoming),result:elementIds(incoming)}),{markEdited:false})
  }

  addContour(anchors:SplineAnchorInput[],options:{closed?:boolean;subShapeId?:string;name?:string}={}):SplineElementIds {
    this.layer(true)
    if (!Array.isArray(anchors)||anchors.length<2||anchors.length>10000) throw new Error('A spline contour needs 2 to 10000 points.')
    const specs:AnchorSpec[]=anchors.map(anchor=>{
      const type=anchor.type??(anchor.in||anchor.out?'bezierCorner':'corner')
      assertCoordinates(anchor.x,anchor.y); assertPointType(type)
      if (type==='corner'&&(anchor.in||anchor.out)) throw new Error('Corner anchors cannot have Bezier handles; choose bezierCorner or smooth.')
      if (anchor.in) assertCoordinates(anchor.in.x,anchor.in.y)
      if (anchor.out) assertCoordinates(anchor.out.x,anchor.out.y)
      return {...copyScriptData(anchor),type}
    })
    if (options.closed !== undefined) assertBoolean(options.closed)
    if (options.name !== undefined&&typeof options.name !== 'string') throw new Error('Spline sub-shape name must be a string.')
    const incoming=buildSplineData({kind:'custom',name:options.name??'Script contour',source:'drawn',contours:[{closed:options.closed??false,anchors:specs}]})
    return this.edit('Add contour',data=>{
      const owner=options.subShapeId ? own(data.subShapes,options.subShapeId) : undefined
      if (options.subShapeId&&!owner) throw new Error(`Spline sub-shape '${options.subShapeId}' not found.`)
      const next=mergeSplineData(data,incoming),ids=elementIds(incoming)
      if (owner) {
        next.subShapes={...data.subShapes,[owner.id]:{...owner,contourIds:[...owner.contourIds,...ids.contourIds]}}
        ids.subShapeIds=[owner.id]
      }
      return {data:next,result:ids}
    })
  }

  addPoint(contourId:string,point:{x:number;y:number;type?:SplinePointType},options:{afterPointId?:string}={}):string {
    assertCoordinates(point.x,point.y); if (point.type) assertPointType(point.type)
    return this.edit('Add point',data=>{
      const contour=this.contour(data,contourId),after=options.afterPointId??contour.pointIds[contour.pointIds.length-1]
      const index=contour.pointIds.indexOf(after)
      if (index<0) throw new Error('afterPointId must belong to the target contour.')
      let next:SplinePathData,id:string
      if (!contour.closed&&index===contour.pointIds.length-1) {
        id=uid('pt'); const segmentId=uid('seg')
        next={...data,points:{...data.points,[id]:{id,x:point.x,y:point.y,type:'corner'}},
          segments:{...data.segments,[segmentId]:{id:segmentId,fromPointId:after,toPointId:id,type:'line'}},
          contours:{...data.contours,[contourId]:{...contour,pointIds:[...contour.pointIds,id],segmentIds:[...contour.segmentIds,segmentId]}}}
      } else {
        const segmentId=contour.segmentIds[index]
        next=insertPointOnSegment(data,segmentId,0.5)
        id=newElementIds(data,next).pointIds[0]
        if (!id) throw new Error('Could not insert a spline point.')
        next=moveSplinePoint(next,id,point.x,point.y)
      }
      if (point.type) next=setSplinePointType(next,id,point.type)
      return {data:next,result:id}
    })
  }
  movePoint(id:string,x:number,y:number):void {
    assertCoordinates(x,y)
    this.edit('Move point',data=>{this.point(data,id);return {data:moveSplinePoint(data,id,x,y),result:undefined}})
  }
  removePoint(id:string):void {
    this.edit('Remove point',data=>{
      this.point(data,id)
      const contour=Object.values(data.contours).find(item=>item.pointIds.includes(id))
      if (!contour||contour.pointIds.length<=2) throw new Error('Use removeContour to remove a contour with only two points.')
      return {data:deleteSplinePoint(data,id),result:undefined}
    })
  }
  setPointType(id:string,type:SplinePointType):void {
    assertPointType(type)
    this.edit('Set point type',data=>{this.point(data,id);return {data:setSplinePointType(data,id,type),result:undefined}})
  }
  setPointLocked(id:string,locked:boolean):void {
    assertBoolean(locked)
    this.edit('Lock point',data=>({data:{...data,points:{...data.points,[id]:{...this.point(data,id),locked}}},result:undefined}),{unlock:`points.${id}`,markEdited:false})
  }
  setHandle(pointId:string,kind:'in'|'out',patch:{x:number;y:number;locked?:boolean}):string {
    assertCoordinates(patch.x,patch.y)
    if (!['in','out'].includes(kind)) throw new Error('Handle kind must be in or out.')
    if (patch.locked!==undefined) assertBoolean(patch.locked)
    return this.edit('Set handle',data=>{
      const point=this.point(data,pointId),existing=handleFor(data,pointId,kind),id=existing?.id??uid('h')
      let next:SplinePathData={...data,points:{...data.points,[pointId]:{...point,type:point.type==='corner'?'bezierCorner':point.type}},
        handles:{...data.handles,[id]:{id,pointId,kind,x:existing?.x??point.x,y:existing?.y??point.y,locked:existing?.locked??false}}}
      for (const segment of Object.values(next.segments)) if ((kind==='out'?segment.fromPointId:segment.toPointId)===pointId&&segment.type==='line') next=setSegmentType(next,segment.id,'cubic')
      next=moveSplineHandle(next,pointId,kind,patch.x,patch.y)
      if (patch.locked!==undefined) next={...next,handles:{...next.handles,[id]:{...next.handles[id],locked:patch.locked}}}
      return {data:next,result:id}
    })
  }
  removeHandle(pointId:string,kind:'in'|'out'):void {
    if (!['in','out'].includes(kind)) throw new Error('Handle kind must be in or out.')
    this.edit('Remove handle',data=>{
      this.point(data,pointId); const handle=handleFor(data,pointId,kind)
      if (!handle) throw new Error('Spline handle not found.')
      const handles={...data.handles};delete handles[handle.id]
      return {data:{...data,handles},result:undefined}
    })
  }
  setHandleLocked(id:string,locked:boolean):void {
    assertBoolean(locked)
    this.edit('Lock handle',data=>{
      const handle=own(data.handles,id);if (!handle) throw new Error('Spline handle not found.')
      return {data:{...data,handles:{...data.handles,[id]:{...handle,locked}}},result:undefined}
    },{unlock:`handles.${id}`,markEdited:false})
  }
  setSegmentType(id:string,type:'line'|'cubic'):void {
    if (!['line','cubic'].includes(type)) throw new Error('Use setQuadraticControl for a quadratic segment.')
    this.edit('Set segment type',data=>{this.segment(data,id);return {data:setSegmentType(data,id,type),result:undefined}})
  }
  setQuadraticControl(id:string,control:{x:number;y:number}):void {
    assertCoordinates(control.x,control.y)
    this.edit('Set quadratic control',data=>({data:{...data,segments:{...data.segments,[id]:{...this.segment(data,id),type:'quadratic',control1:copyScriptData(control)}}},result:undefined}))
  }
  splitSegment(id:string,t=0.5):{pointId:string;segmentIds:string[]} {
    if (typeof t!=='number'||!Number.isFinite(t)||t<=0||t>=1) throw new Error('Split position must be between 0 and 1, exclusively.')
    return this.edit('Split segment',data=>{
      this.segment(data,id);const next=insertPointOnSegment(data,id,t),ids=newElementIds(data,next)
      if (!ids.pointIds.length) throw new Error('Could not split the spline segment.')
      return {data:next,result:{pointId:ids.pointIds[0],segmentIds:ids.segmentIds}}
    })
  }
  setContourClosed(id:string,closed:boolean):void {
    assertBoolean(closed)
    this.edit(closed?'Close contour':'Open contour',data=>{this.contour(data,id);return {data:setContourClosed(data,id,closed),result:undefined}})
  }
  reverseContour(id:string):void {
    this.edit('Reverse contour',data=>{this.contour(data,id);return {data:reverseContour(data,id),result:undefined}})
  }
  private removeContours(data:SplinePathData,ids:Set<string>):SplinePathData {
    const points=new Set<string>(),segments=new Set<string>()
    for (const id of Array.from(ids)) { const contour=this.contour(data,id);contour.pointIds.forEach(point=>points.add(point));contour.segmentIds.forEach(segment=>segments.add(segment)) }
    const handles=new Set(Object.values(data.handles).filter(handle=>points.has(handle.pointId)).map(handle=>handle.id))
    const subShapes:Record<string,SplineSubShape>={}
    for (const sub of Object.values(data.subShapes)) {
      const contourIds=sub.contourIds.filter(id=>!ids.has(id))
      if (contourIds.length) subShapes[sub.id]=contourIds.length===sub.contourIds.length?sub:{...sub,contourIds}
    }
    return {...data,subShapes,points:without(data.points,points),segments:without(data.segments,segments),
      handles:without(data.handles,handles),contours:without(data.contours,ids)}
  }
  removeContour(id:string):void {
    this.edit('Remove contour',data=>({data:this.removeContours(data,new Set([id])),result:undefined}))
  }
  removeSubShape(id:string):void {
    this.edit('Remove sub-shape',data=>{
      const sub=own(data.subShapes,id);if (!sub) throw new Error(`Spline sub-shape '${id}' not found.`)
      return {data:this.removeContours(data,new Set(sub.contourIds)),result:undefined}
    })
  }
  setSubShape(id:string,patch:{name?:string}):void {
    if (typeof patch.name!=='string') throw new Error('Only a string name can be patched on a spline sub-shape.')
    this.edit('Rename sub-shape',data=>{
      const sub=own(data.subShapes,id);if (!sub) throw new Error('Spline sub-shape not found.')
      return {data:{...data,subShapes:{...data.subShapes,[id]:{...sub,name:patch.name!}}},result:undefined}
    },{markEdited:false})
  }
  setFillRule(rule:'nonzero'|'evenodd'):void {
    if (!['nonzero','evenodd'].includes(rule)) throw new Error('Unknown spline fill rule.')
    this.edit('Set fill rule',data=>({data:{...data,fillRule:rule},result:undefined}),{markEdited:false})
  }
  transform(affine:SplineAffineTransform,options:{subShapeId?:string}={}):void {
    assertCoordinates(affine.a,affine.b,affine.c,affine.d,affine.e,affine.f)
    const matrix=new Matrix2D(affine.a,affine.b,affine.c,affine.d,affine.e,affine.f)
    this.edit('Transform geometry',data=>{
      const transformed=transformSplineData(data,matrix)
      if (!options.subShapeId) return {data:transformed,result:undefined}
      const sub=own(data.subShapes,options.subShapeId);if (!sub) throw new Error('Spline sub-shape not found.')
      const points=new Set(sub.contourIds.flatMap(id=>data.contours[id].pointIds))
      const segments=new Set(sub.contourIds.flatMap(id=>data.contours[id].segmentIds))
      return {data:{...data,points:{...data.points,...Object.fromEntries(Object.entries(transformed.points).filter(([id])=>points.has(id)))},
        handles:{...data.handles,...Object.fromEntries(Object.entries(transformed.handles).filter(([,handle])=>points.has(handle.pointId)))},
        segments:{...data.segments,...Object.fromEntries(Object.entries(transformed.segments).filter(([id])=>segments.has(id)))}},result:undefined}
    })
  }
}
