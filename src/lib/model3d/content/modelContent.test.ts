import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Mesh } from 'three'
import { animatedModelBytes } from '../__tests__/animatedModel'
import { prepareModelSource, type ModelPreparedSource } from '../resources/modelInventory'
import { ModelPose } from '../render/ModelPose'
import { ModelComposition } from '../render/ModelComposition'
import { disposeModelTrees } from '../render/ThreeModelBackend'
import { modelEditBase } from './modelEditBase'
import { withModelContent, assertModelContent, contentInstance, modelAssetIds } from './modelContent'
import { cameraIsDriven } from '../source/cameraDrivers'
import { modelDefaults, newModelLayer, validateModel } from '../source/modelDefaults'
import { ItemDetailSession } from '../../editor/detail/ItemDetailSession'
import { emptyScene } from '../../defaults'
import { addModelClip } from '../../editor/detail/ModelClipDraft'
import { makeKeyframeLayerSnapshotCmd, makeAddKfCmd } from '../../editor/commands-keyframe'
import { contentTimelineContext } from '../../timeline/authoring/TimelineAuthoringContext'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { prepareRenderFrame } from '../../render/prepareRenderFrame'
import { ModelAssetService } from '../resources/ModelAssetService'
import { assertInstanceInventory } from './assertInstanceInventory'
import { editorResourceBudget } from '../../resources/budget'
import { makeAddAnimationCmd } from '../../timeline/addAnimationCommand'
import { makeSetPropertyExpressionCmd } from '../../editor/inputExpressions/PropertyExpressionCommand'
import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'
import { listLayerParameterRefs } from '../../wiring/helpers'
import { cloneSingleLayer } from '../../clone/CloneSingleLayer'
import { AssetIndex } from '../../asset/AssetIndex'
import '../../registry/bootstrap'
import { addSceneObject, cameraFromView } from '../source/modelSceneObjects'
let source: ModelPreparedSource
beforeAll(async () => {
  vi.stubGlobal('ProgressEvent', class extends Event { constructor(type: string, init: object) { super(type); Object.assign(this, init) } })
  vi.stubGlobal('FileReader', class { result: unknown; onloadend?: () => void; onerror?: () => void
    readAsArrayBuffer(blob: Blob) { blob.arrayBuffer().then(bytes => { this.result = bytes; this.onloadend?.() }).catch(() => this.onerror?.()) }
    readAsDataURL(blob: Blob) { blob.arrayBuffer().then(bytes => { this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`; this.onloadend?.() }).catch(() => this.onerror?.()) }
  })
  const gltf = await new GLTFLoader().parseAsync(animatedModelBytes(), '')
  source = prepareModelSource(gltf.scene, gltf.animations, gltf.parser, 'a'.repeat(64))
})
afterAll(() => { disposeModelTrees([source.root]); vi.unstubAllGlobals() })
const data = () => withModelContent(modelDefaults('asset'), source.inventory)
const scene = () => { const s = emptyScene(), l = newModelLayer('box', 'asset'); l.model3d = data(); s.layers = [l]; return s }

describe('3D0 revision-bound node content', () => {
  it('identifies real imported node hierarchy by indices, preserving original nodes and source version', () => {
    const d = data(); expect(d.version).toBe(3); expect(source.inventory.nodes.map(n => [n.id,n.parentId])).toContainEqual(['n0','n1'])
    expect(d.content!.instances.primary.nodes.n0.position).toEqual({x:0,y:0,z:0}); expect(modelDefaults('asset').version).toBe(1)
  })
  it('applies local TRS without changing source/other poses, and restores A→B→A', () => {
    const a = new ModelPose(source), b = new ModelPose(source), i = data().content!.instances.primary
    try {
      i.nodes.n0.position.x = 2; a.sample(i); b.sample(data().content!.instances.primary)
      expect(a.getNode('n0')!.position.x).toBe(2); expect(b.getNode('n0')!.position.x).toBe(0)
      a.sample(data().content!.instances.primary); expect(a.getNode('n0')!.position.x).toBe(0)
      expect(source.root.getObjectByName('Test_triangle')?.position.x ?? source.inventory.nodes[0].position.x).toBe(0)
    } finally { a.dispose(); b.dispose() }
  })
  it('rejects changed revisions, missing nodes and invalid numerical/structural source', () => {
    const d = data(); d.content!.instances.primary.revision = 'b'.repeat(64)
    expect(() => assertInstanceInventory(d.content!.instances.primary, source.inventory)).toThrow(/revision/)
    d.content!.instances.primary.revision = source.inventory.revision; d.content!.instances.primary.nodes.n900 = d.content!.instances.primary.nodes.n0
    expect(() => assertInstanceInventory(d.content!.instances.primary, source.inventory)).toThrow(/missing/)
    d.content!.instances.primary.scale = 0; expect(() => validateModel(d)).toThrow(/transform/)
    expect(() => validateModel({...data(), version:1})).toThrow(/version 3/)
  })
  it('publishes one scoped command and preserves outer/source/history; stale apply fails', () => {
    const s=scene(), session=new ItemDetailSession(s,4,new AbortController().signal,'box'), draft=session.animation!
    draft.registerInventory('asset',source.inventory)
    const next=structuredClone(draft.initial); next.layers[0].model3d!.content!.instances.primary.nodes.n0.position.y=.3
    // Preserve borrowed root references (the draft may change only content).
    const edit={...draft.initial,layers:next.layers}
    const cmd=session.prepareClipApply(edit,s,4,session.document)!, result=cmd.execute(s)
    expect(result.timelines).toBe(s.timelines); expect(result.layers[0].transform).toBe(s.layers[0].transform)
    expect(result.layers[0].model3d!.content!.instances.primary.nodes.n0.position.y).toBe(.3)
    expect(cmd.undo(result).layers[0]).toEqual(s.layers[0]); expect(() => session.prepareClipApply(edit,s,5,session.document)).toThrow(/changed/)
    expect(parseSceneJson(JSON.stringify(result),true).layers[0].model3d).toEqual(result.layers[0].model3d)
  })
  it('rejects unprepared final Apply and leaves opening/Cancel source unchanged', () => {
    const s=scene(), before=JSON.stringify(s), session=new ItemDetailSession(s,0,new AbortController().signal,'box')
    expect(() => session.prepareClipApply(session.animation!.initial,s,0,session.document)).toThrow(/Wait/)
    session.close(); expect(JSON.stringify(s)).toBe(before)
  })
})
describe('3D1–3D2 inspection and private PBR state', () => {
  it('exports authored output camera and scene without editor overlays', async () => {
    const world = new ModelComposition(source, () => undefined)
    try {
      world.configure(data(), 320, 240)
      const glb = await world.exportGlb()
      const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
      expect(view.getUint32(0, true)).toBe(0x46546c67)
      const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + view.getUint32(12, true))))
      expect(json.cameras?.length).toBe(1)
      expect(json.nodes.some((node: { name?: string }) => node.name === 'Chorono Output')).toBe(true)
      expect(JSON.stringify(json)).not.toMatch(/grid|selection outline|gizmo/i)
    } finally { world.dispose() }
  })
  it('exports the active scene camera and punctual light instead of the legacy output pose', async () => {
    const world = new ModelComposition(source, () => undefined)
    const base = data()
    const inactive = cameraFromView('cam_a', { ...base.camera, yaw: 80, projection: 'perspective', orthoHeight: 2.8 })
    const camera = cameraFromView('cam_b', { ...base.camera, yaw: -65, projection: 'orthographic', orthoHeight: 4 })
    const withCameras = addSceneObject(addSceneObject(base, inactive), camera)
    const authored = addSceneObject({ ...withCameras, sceneObjects: { ...withCameras.sceneObjects!, activeCameraId: camera.id } }, { id: 'light_a', name: 'Key Point', kind: 'light',
      lightType: 'point', position: { x: 0, y: 1, z: 0 }, target: { x: 0, y: 0, z: 0 }, color: '#ffddaa', intensity: 4, shadows: false })
    try {
      world.configure(authored, 320, 240)
      const glb = await world.exportGlb(), view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
      const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + view.getUint32(12, true))))
      expect(json.cameras).toMatchObject([{ type: 'orthographic' }])
      expect(json.extensions?.KHR_lights_punctual?.lights).toMatchObject([{ type: 'point', name: 'Key Point' }])
      const cameraNode = json.nodes.find((node: { camera?: number }) => node.camera === 0)
      expect((cameraNode.translation ?? cameraNode.matrix?.slice(12, 15))[0]).toBeCloseTo(camera.position.x)
      expect((cameraNode.translation ?? cameraNode.matrix?.slice(12, 15))[1]).toBeCloseTo(camera.position.y)
      world.configure(authored, 600, 400, undefined, { camera: { ...base.camera, projection: 'perspective', orthoHeight: 2.8 },
        selection: { instanceId: '@scene', nodeId: 'light_a' } })
      const gizmo = world.gizmo(600, 400)!
      expect(gizmo).toBeTruthy()
      expect(world.pick(gizmo.origin.x, gizmo.origin.y, 600, 400)).toEqual({ instanceId: '@scene', nodeId: 'light_a' })
    } finally { world.dispose() }
  })
  it('picks and frames a node; orthographic inspection never writes the output camera', () => {
    const d=data(), before=JSON.stringify(d), world=new ModelComposition(source,()=>undefined), view={camera:{...d.camera,projection:'orthographic' as const,orthoHeight:2.8},selection:{instanceId:'primary',nodeId:'n0'}}
    try { world.configure(d,600,400,undefined,view); expect(world.gizmo(600,400)?.axes.x).toBeTruthy(); expect(world.frame()!.distance).toBeGreaterThan(0)
      const gizmo=world.gizmo(600,400)!; expect(world.pick(gizmo.origin.x,gizmo.origin.y,600,400)).toEqual(view.selection); expect(JSON.stringify(d)).toBe(before)
    } finally { world.dispose() }
  })
  it('material edits are private and restore after alternating uses', () => {
    const d=data(), a=new ModelPose(source), b=new ModelPose(source), i=d.content!.instances.primary
    try { i.materials.m0.color='#00ff00'; i.materials.m0.opacity=.4; a.sample(i); b.sample(data().content!.instances.primary)
      const material=(p:ModelPose)=>{const n=p.getNode('n0')! as Mesh;return Array.isArray(n.material)?n.material[0]:n.material}
      expect(material(a)).not.toBe(material(b)); expect(material(a).opacity).toBe(.4); expect(material(a).transparent).toBe(true); expect(material(b).opacity).toBe(1)
      a.sample(data().content!.instances.primary); expect(material(a).opacity).toBe(1)
    } finally { a.dispose(); b.dispose() }
  })
  it('keeps extended PBR appearance private, validated and portable', () => {
    const d = data(), instance = d.content!.instances.primary, pose = new ModelPose(source)
    instance.materials.m0.emissiveColor = '#3366ff'
    instance.materials.m0.emissiveIntensity = 3
    instance.materials.m0.alphaMode = 'mask'
    instance.materials.m0.alphaCutoff = .4
    instance.materials.m0.doubleSided = true
    try {
      assertModelContent(d.content!)
      pose.sample(instance)
      const node = pose.getNode('n0')! as Mesh
      const material = (Array.isArray(node.material) ? node.material[0] : node.material) as import('three').MeshStandardMaterial
      expect([material.emissive.getHexString(), material.emissiveIntensity, material.alphaTest, material.side]).toEqual(['3366ff', 3, .4, 2])
      expect(parseSceneJson(JSON.stringify({ ...scene(), layers: [{ ...scene().layers[0], model3d: d }] }), true).layers[0].model3d?.content?.instances.primary.materials.m0.emissiveColor).toBe('#3366ff')
      instance.materials.m0.emissiveIntensity = 21
      expect(() => assertModelContent(d.content!)).toThrow(/material/)
    } finally { pose.dispose() }
  })
})
describe('3D3 native clips, skeleton-safe independent absolute sampling', () => {
  it('loads native clips through the real resource service and retains inventory', async () => {
    const service=new ModelAssetService(), bytes=new Uint8Array(animatedModelBytes()), pin=await service.acquire({id:'asset',type:'model3d',name:'native',url:`data:model/gltf+json;base64,${btoa(String.fromCharCode(...Array.from(bytes)))}`})
    try { expect(pin.value.inventory!.clips[0].durationMs).toBe(1000); expect(pin.value.inventory!.revision).toMatch(/^[a-f0-9]{64}$/) }
    finally { pin.release(); service.clearIdle() }
    expect(service.getSnapshot().residency.chargedBytes).toBe(0)
  })
  it('seeks translation+morph forwards/backwards independently and rejects competing pose edits', () => {
    const a=new ModelPose(source), b=new ModelPose(source), i=data().content!.instances.primary
    i.native={clipId:'c0',inMs:100,outMs:900,speed:1,loop:true,mode:'scrub',timeMs:500,channels:source.inventory.clips[0].channels}
    try {
      for (const t of [500,900,100,500]) { i.native.timeMs=t; a.sample(i); expect(a.getNode('n1')!.position.x).toBeCloseTo(t/1000); expect((a.getNode('n0') as Mesh).morphTargetInfluences![0]).toBeCloseTo(t/1000) }
      b.sample(data().content!.instances.primary); expect(b.getNode('n1')!.position.x).toBe(0)
      i.nodes.n1.position.x=2; expect(()=>assertInstanceInventory(i,source.inventory)).toThrow(/native clip/)
    } finally { a.dispose(); b.dispose() }
  })
  it('samples in/out, speed, loop and independent owner start without source mutation', () => {
    const s=scene(), d=s.layers[0].model3d!, i=d.content!.instances.primary
    i.native={clipId:'c0',inMs:100,outMs:900,speed:2,loop:true,mode:'play',timeMs:100,channels:source.inventory.clips[0].channels}; s.layers[0].startMs=200
    const before=JSON.stringify(s)
    expect(prepareRenderFrame(s,500).scene.layers[0].model3d!.content!.instances.primary.native!.timeMs).toBe(700)
    expect(prepareRenderFrame(s,600).scene.layers[0].model3d!.content!.instances.primary.native!.timeMs).toBe(100)
    expect(JSON.stringify(s)).toBe(before)
  })
})
describe('3D4 private node and pose channels', () => {
  it('keys node TRS/visibility and native pose time through native scoped commands', () => {
    const s=scene(), session=new ItemDetailSession(s,0,new AbortController().signal,'box'), content=session.animation!, command=addModelClip(content)
    let d=command.execute(content.initial), layer=d.layers[0], context=contentTimelineContext(d,'box',command.clipId)
    const path='model3d.content.instances.primary.nodes.n0.position.x'; layer=structuredClone(layer); layer.model3d!.content!.instances.primary.nodes.n0.position.x=.7
    d=makeKeyframeLayerSnapshotCmd(command.clipId,layer,500,[path],context).execute(d)
    const payload=content.model(d); expect(payload.animation!.clips[0].tracks[0].target).toBe(`layers.content.${path}`)
    expect(makeKeyframeLayerSnapshotCmd(command.clipId,layer,500,['model3d.content.instances.primary.assetId'],context).execute(d)).toBe(d)
    expect(s.timelines.flatMap(t=>t.tracks)).toHaveLength(0)
  })
  it('authors exact native pose time and boolean visibility while blocking native TRS ownership', () => {
    const s=scene(), sourceModel=s.layers[0].model3d!, native={clipId:'c0',inMs:100,outMs:900,speed:1,loop:true,mode:'play' as const,timeMs:100,channels:source.inventory.clips[0].channels}
    sourceModel.content!.instances.primary.native=native
    const session=new ItemDetailSession(s,0,new AbortController().signal,'box'), content=session.animation!, command=addModelClip(content)
    let d=command.execute(content.initial), context=contentTimelineContext(d,'box',command.clipId)
    const time='model3d.content.instances.primary.native.timeMs', visible='model3d.content.instances.primary.nodes.n0.visible'
    for (const path of [time, visible]) d=makeAddAnimationCmd(command.clipId,'box',path,undefined,context).execute(d)
    for (const [ms,value] of [[0,200],[1000,700]]) d=makeAddKfCmd(command.clipId,`layers.box.${time}`,{id:`time${ms}`,timeMs:ms,value,easing:{type:'linear'}},context).execute(d)
    d=makeAddKfCmd(command.clipId,`layers.box.${visible}`,{id:'hide',timeMs:500,value:false,easing:{type:'hold'}},context).execute(d)
    const model=content.model(d), frame=prepareRenderFrame({...s,layers:[{...s.layers[0],model3d:model}]},500).scene.layers[0].model3d!
    expect(frame.content!.instances.primary.native!.timeMs).toBe(450);expect(frame.content!.instances.primary.nodes.n0.visible).toBe(false)
    expect(()=>makeAddKfCmd(command.clipId,'layers.box.model3d.content.instances.primary.nodes.n1.position.x',{id:'bad',timeMs:0,value:1,easing:{type:'linear'}},context).execute(d)).toThrow(/outside/)
  })
  it('keeps native playback on the same looping private clock as node keys', () => {
    const s=scene(); s.layers[0].startMs=200
    const d=s.layers[0].model3d!, i=d.content!.instances.primary
    i.native={clipId:'c0',inMs:100,outMs:900,speed:1,loop:true,mode:'play',timeMs:100,channels:source.inventory.clips[0].channels}
    d.animation={version:1,activeClipId:'local',clips:[{id:'local',name:'Local',durationMs:1000,loop:true,autoplay:false,tracks:[]}]}
    expect(prepareRenderFrame(s,1250).scene.layers[0].model3d!.content!.instances.primary.native!.timeMs).toBe(150)
    expect(prepareRenderFrame(s,250).scene.layers[0].model3d!.content!.instances.primary.native!.timeMs).toBe(150)
  })
  it('charges shadow storage per world and releases it on disable/dispose', () => {
    const before=editorResourceBudget.getSnapshot().chargedBytes, world=new ModelComposition(source,()=>undefined), d=data()
    try { d.content!.light.shadows=true; world.configure(d,400,300); expect(editorResourceBudget.getSnapshot().categories.gpu.residentBytes).toBe(512*512*8)
      d.content!.light.shadows=false; world.configure(d,400,300);expect(editorResourceBudget.getSnapshot().categories.gpu.residentBytes).toBe(0)
    }finally{world.dispose()}
    expect(editorResourceBudget.getSnapshot().chargedBytes).toBe(before)
  })
})
describe('3D5–3D6 assemblies and typed controls', () => {
  it('tracks all assembly source dependencies and separate normalized poses', () => {
    const d=data(); d.content!.instances.second=contentInstance('second',source.inventory,'Second'); d.content!.instances.second.position.x=2
    expect(modelAssetIds(d)).toEqual(['asset','second']); const l=newModelLayer('box','asset'); l.model3d=d
    const index=new AssetIndex(); index.build([l]); expect(index.getLayerIds('second')).toEqual(['box'])
    const world=new ModelComposition(source,()=>source), resource={bytes:0,draw(){},dispose(){}}
    try { world.configure(d,400,300,()=>resource); expect(world.frame()!.target.x).toBeGreaterThan(0); expect(world.frame()!.distance).toBeGreaterThan(3.5) }
    finally { world.dispose() }
  })
  it('maps typed per-instance parameter values without changing source or allowing two writers', () => {
    const s=scene(), c=s.layers[0].model3d!.content!, target='model3d.content.instances.primary.nodes.n0.position.x'
    c.parameters.move={name:'Move',type:'number',value:.8,min:0,max:1,target}; assertModelContent(c)
    const before=JSON.stringify(s), frame=prepareRenderFrame(s,500)
    expect(frame.scene.layers[0].model3d!.content!.instances.primary.nodes.n0.position.x).toBe(.8); expect(JSON.stringify(s)).toBe(before)
    c.parameters.copy={...c.parameters.move}; expect(()=>assertModelContent(c)).toThrow(/target/)
  })
  it('preserves driven authored fallbacks while editing another sampled field', () => {
    const s=scene(), layer=s.layers[0], target='model3d.content.explode'
    layer.model3d!.content!.parameters.spread={name:'Spread',type:'number',value:.4,min:0,max:2,target}
    const sampled=prepareRenderFrame(s,500).scene.layers[0], next=structuredClone(sampled)
    next.model3d!.content!.instances.primary.nodes.n0.position.x=.3
    const authored=modelEditBase(next,layer,sampled,false)
    expect(authored.model3d!.content!.explode).toBe(0); expect(authored.model3d!.content!.timeMs).toBeUndefined()
    expect(authored.model3d!.content!.instances.primary.nodes.n0.position.x).toBe(.3)
    next.model3d!.content!.explode=.8;expect(()=>modelEditBase(next,layer,sampled,false)).toThrow(/driven/)
  })
  it('connects exposed inputs through existing live expressions and Wire pickers', () => {
    let s=scene(); s.timelines=[{id:'clock',durationMs:1000,autoplay:true,loop:false,tracks:[]}]
    const path='model3d.content.parameters.move.value', target='model3d.camera.yaw'
    s.layers[0].model3d!.content!.parameters.move={name:'Orbit',type:'number',value:0,min:0,max:90,target}
    expect(listLayerParameterRefs(s.layers[0]).some(r=>r.propertyPath===path)).toBe(true)
    expect(cameraIsDriven(s,s.layers[0])).toBe(true)
    s=makeSetPropertyExpressionCmd(s,'box',path,{resultType:'number',formula:'timeSec*60',timelineId:'clock',sources:{}}).execute(s)
    const frame=evaluateSceneFrame(s,500)
    expect(frame.expressionErrors?.size??0).toBe(0); expect(frame.overrides.get(`layers.box.${target}`)).toBe(30)
    const clone=structuredClone(s); delete clone.layers[0].propertyExpressions
    clone.parameterWires=[{id:'wire',source:{layerId:'box',propertyPath:'opacity',valueType:'number'},target:{layerId:'box',propertyPath:path,valueType:'number'},expression:'45',enabled:true,blendMode:'override',createdAt:0,updatedAt:0}]
    expect(evaluateSceneFrame(clone,500).overrides.get(`layers.box.${target}`)).toBe(45)
  })
  it('keeps thin-instance inputs independent, keyable and live-expression driven', () => {
    let s=scene(); s.timelines=[{id:'clock',durationMs:1000,autoplay:true,loop:false,tracks:[]}]
    s.layers[0].model3d!.content!.parameters.orbit={name:'Orbit',type:'number',value:10,min:0,max:90,target:'model3d.camera.yaw'}
    const instance=cloneSingleLayer(s.layers[0],{mode:'instance'}).clonedLayer; instance.id='instance'; instance.model3dInputValues!.orbit=25
    s.layers.push(instance)
    expect(instance.model3d).toBeUndefined()
    let rendered=prepareRenderFrame(s,0).scene.layers
    expect(rendered[0].model3d!.camera.yaw).toBe(10);expect(rendered[1].model3d!.camera.yaw).toBe(25)
    s=makeSetPropertyExpressionCmd(s,'instance','model3dInputValues.orbit',{resultType:'number',formula:'timeSec*60',timelineId:'clock',sources:{}}).execute(s)
    rendered=prepareRenderFrame(s,500).scene.layers
    expect(rendered[0].model3d!.camera.yaw).toBe(10);expect(rendered[1].model3d!.camera.yaw).toBe(30)
    expect(parseSceneJson(JSON.stringify(s),true).layers[1].model3dInputValues).toEqual({orbit:25})
  })
  it('releases bounded pose allocations after repeated create/dispose', () => {
    const before=editorResourceBudget.getSnapshot().chargedBytes
    for(let i=0;i<12;i++){const pose=new ModelPose(source);pose.sample(data().content!.instances.primary);pose.dispose();pose.dispose()}
    expect(editorResourceBudget.getSnapshot().chargedBytes).toBe(before)
  })
})
