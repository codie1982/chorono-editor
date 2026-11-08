import Ajv from 'ajv'
import { actionRegistry } from '../ai/ActionRegistry'
import { bootstrapMCPActions } from './actions'
import { EXTRA_TOOLS } from './extraTools'
import { withBridgeParameters, withNativeToolContract } from './toolContext'
import { layerRegistry } from '../registry'
import { getAllParticlePresets } from '../particles/presets'
import { assertOperation, LIMITS, MCP_VERSION, type ToolDefinition, type JsonObject } from './protocol'

export const SCRIPT_HELP = `Chorono SceneAPI ${MCP_VERSION}. Scripts are synchronous authoring operations; they create editable layers/tracks rather than running every playback frame.
scene.add(kind) -> Layer; scene.get(id), scene.find(name), scene.layers; scene.remove(handle)
scene.snapshot() returns the complete current scene as detached JSON. scene.assets/assetCollections/parameters/triggers/bindings/parameterWires/stateMachines/initialState are detached JSON getters. Editing these copies never changes the editor; use command methods. scene.setInitialState(object) replaces initialState.
Layer: id/name/type getters; pos=[x,y], size=[w,h], opacity, rotation, scale=[x,y], fill, text, cornerRadius, blendMode
Layer reads: layer.data is a detached complete Layer; layer.get('style.fill.color') reads a detached nested value (null if missing). Layer methods: set(Partial<Layer>) shallowly replaces nested objects; patch(deepPartial) recursively merges objects and replaces arrays/scalars/null, preserving unrelated nested settings. patch refuses id/type changes. font({family,size,weight,color,align}), stroke({color,width,opacity}), shapeParam(name,value), parent(handle|id|null), interactive(options), followPath(pathId,options), configureParticles(config), key(property,timeMs,value,easing)
scene.composition({width,height,durationMs,frameRate,backgroundColor}); scene.createTimeline({id,durationMs,loop,autoplay}); scene.timelines
scene.useTimeline(id) selects the timeline used by subsequent Layer.key calls. scene.timeline(id) returns Timeline; scene.cloneTimeline(id,newId); scene.deleteTimeline(id)
cloneTimeline keeps the same objects and animation values but assigns fresh keyframe ids. Read the clone before targeting individual keys. Reassign state-machine references before deleting a timeline.
Audio clips: import_asset imports and places a file, or add_audio_clip reuses an existing asset. Native move_audio_clip/trim_audio_clip/split_audio_clip/set_audio_gain/set_audio_fades share editor undo behavior. audio.volume is linear gain (0..4), UI gain is in dB; 0dB=1, -6.0206dB=0.5. audio.fadeInMs/fadeOutMs/pan/timelineId are editable. Never use generic animation stretching to trim audio. Render audio with render_audio_preview/export_audio; PNG preview has no sound.
In scripts, scene.audioClip(assetId,{timelineId?,startMs?,layerId?,name?}) returns a Layer and uses native placement/membership/duration commands. layer.audioGain(gainDb,{timeMs?,timelineId?}), audioFades({fadeInMs?,fadeOutMs?}), moveAudio(startMs,{timelineId?}), trimAudio({startMs?,endMs?},{timelineId?}), splitAudio(timeMs,{timelineId?,rightLayerId?})->rightLayer share native safe audio commands. Animated gain requires timeMs; an existing gain key keeps its id/easing/metadata. Use these helpers instead of raw audio/timing patches for clip edits.
Timeline: id, data; set(options), key(layerOrId,property,timeMs,value,easing), track(target,patch), removeTrack(target), modifier(target,{type,parameters,weight,blendMode}), bake(target,fps,tolerance)
Animation values: numbers interpolate with easing; color property paths interpolate RGB/alpha channels (CSS hex/rgb/hsl, RGBA ColorValue 0..255, legacy packed RGB); Vec2 values interpolate x/y. Ordinary strings and booleans hold until the next key. Controllers, signal modifiers and bake are numeric-only. Values must match the property's model/schema. Renderer applies evaluated values to layer data before drawing, including particles, repeaters, geometry, typography, effects and masks. Key existing point/handle scalar coordinates for fixed-topology path/spline motion; whole-object topology morphing is not supported.
Easing: linear, hold, easeIn, easeOut, easeInOut or {type:'customBezier',bezier:{cx1:0.2,cy1:0,cx2:0.3,cy2:1}}. Easing is applied from the START keyframe.
scene.clone(handle,count,{offsetX,offsetY,mode,timelineId?}); scene.array(handle,{pattern:'radial',count:8,radius:120},{timelineId?}). Both copy the active useTimeline animation, or first timeline by default; explicit timelineId overrides it.
scene.addPath([[x,y],...],{role:'motion'|'visual',closed,x,y,name}); scene.addSpline(kind,params,options); layer.followPath(path.id,{orientToPath:true}); animate followPath.progress 0..1
scene.addEmitter(preset,options); scene.addParam(id,value,{type,min,max}); scene.wire(sourceProperty,targetProperty,expression,options); scene.addTrigger(eventType,actionType,options)
Particle domain: scene.particlePresets and layer.particles.presets return detached metadata; particles.data is detached full config. getPreset(name), applyPreset(name), patch(deepPartial), emission(patch), visual(patch), animation(patch), random(patch), rendering(patch), seed(uint32OrString). Presets preserve the layer shell; configureParticles also uses validated deep merging. life(channel,stops), lifeKey(channel,t,value,easing?), removeLifeKey(channel,t), clearLife(channel), with channel scale/opacity/color and normalized t=0..1. Life easing belongs to the DESTINATION stop; color accepts CSS or RGBA0..255. motionModifiers getter; addMotionModifier('noiseDrift'|'sineWave'|'spiral',options)->index, updateMotionModifier(index,patch), removeMotionModifier(index). Indices shift on removal. Path/source-layer emission references existing area.pathLayerId/sourceLayerId geometry; circle/rectangle emitFromEdge and modifier phase are native settings. Flow graphs and additional burstMarkers are not implemented and are rejected.
Spline domain: layer.spline.data/bounds; getPoint/getHandle/getSegment/getContour/getSubShape(id) return detached records or null. appendPrimitive(kind,params,{x?,y?,name?}) and addContour(anchors,{closed?,subShapeId?,name?}) return {subShapeIds,contourIds,pointIds,handleIds,segmentIds}. Primitive kinds: line,rectangle,circle,ellipse,arc,donut,ngon,star. addPoint(contourId,{x,y,type?},{afterPointId?})->pointId; movePoint(id,x,y), removePoint(id), setPointType(id,'corner'|'smooth'|'bezier'|'bezierCorner'), setPointLocked(id,bool). setHandle(pointId,'in'|'out',{x,y,locked?})->handleId; removeHandle(pointId,kind), setHandleLocked(handleId,bool). setSegmentType(id,'line'|'cubic'), setQuadraticControl(id,{x,y}), splitSegment(id,t)->{pointId,segmentIds}, 0<t<1. setContourClosed(id,bool), reverseContour(id), removeContour(id), removeSubShape(id), setSubShape(id,{name?}), setFillRule('nonzero'|'evenodd'), transform({a,b,c,d,e,f},{subShapeId?}). Coordinates are layer-local; transform/pivot/parent stay unchanged. Deleted-element tracks are removed atomically. Locked/frozen hierarchy and point/handle locks are respected. Instance particle/spline data is readable; edit the source explicitly.
Explorer domain: scene.explorer.tree/nodes metadata, roots id list; node(id,{timelineId?,timeMs?}) also includes full layer data, relationships, flags, links, track summaries, effects and worldBounds (null for hidden geometry/audio). children(id|null), ancestors(id), descendants(id) return ids. query(search,options?) or query({search,timelineId,timeMs,parentId,recursive,includeAncestors,offset,limit}) uses the panel faceted grammar; default returns matches in authored order, includeAncestors retains their chain. Read defaults to script-selected/first timeline at t=0. group(ids,{name?})->groupId, ungroup(id,{keepWorld?})->childIds, reparent(ids,parentId|null,{keepWorld?,timeMs?})->movedIds, rename(id,name), reorder(id,siblingIndex), moveBefore/After(id,referenceId), setFlags(ids,{hidden?,locked?,solo?,pinned?}). World placement is preserved by default; group siblings before transform animation. Lossy shear/singular/animated/bound transforms or group compositing require bake or explicit keepWorld:false. This is scene data access, not DOM/selection/collapse/column or temporary UI-filter control.
scene.addStateMachine(name) -> Machine; Machine.addState(name,timelineId,options) -> stateId; addTransition(from,to,event,{guard,blendMs,priority}); setInitial(stateId)
scene.stateMachine(id) opens an existing machine. Machine.data returns detached JSON; set(patch), remove(), updateState(id,patch), removeState(id), updateTransition(id,patch), removeTransition(id) edit it. State options support id/speed/entryActions/exitActions/x/y. Removing a state removes its transitions and chooses a remaining initial state.
scene.editEntity(collection,'add'|'update'|'remove',id,value?) supports parameters/triggers/bindings/parameterWires/stateMachines. Records update shallowly with immutable ids. Convenience methods: updateParam/removeParam, updateTrigger/removeTrigger, updateWire/removeWire, addBinding(fullBinding)/updateBinding/removeBinding, removeStateMachine. addTrigger and wire return their new ids.
scene.log(...values). Use get_capabilities for real object kinds and presets. No scene.update, scene.on or async I/O. Layer.set replaces nested objects, so preserve nested fields when patching existing objects.
Example:
const intro=scene.createTimeline({id:'intro',durationMs:2000});
const ball=scene.add('circle'); ball.set({name:'Hero'}); ball.pos=[80,120];
intro.key(ball,'transform.x',0,80,'easeOut').key(ball,'transform.x',1500,600);
const loop=scene.cloneTimeline('intro','loop'); loop.set({loop:true});
loop.modifier('layers.'+ball.id+'.transform.y',{type:'sine',parameters:{amplitude:30,frequency:1}});
`

let catalogPromise: Promise<ToolDefinition[]> | undefined
/** Return the cached MCP catalog, preserving native action schemas and adding bridge-only documentation. */
export function getToolCatalog(): Promise<ToolDefinition[]> {
  return catalogPromise ??= bootstrapMCPActions().then(() => {
    const special = new Set(EXTRA_TOOLS.map(t => t.name))
    const native = actionRegistry.toMCPTools()
      .filter(tool => !special.has(tool.name))
      .map(tool => withNativeToolContract(tool, !!actionRegistry.get(tool.name)?.read))
    return [...native, ...EXTRA_TOOLS].map(withBridgeParameters)
  })
}

const ajv = new Ajv({ strict: false, allErrors: true })
const validators = new Map<string, ReturnType<typeof ajv.compile>>()
export async function validateToolCall(name: string, args: JsonObject): Promise<ToolDefinition> {
  const tool = (await getToolCatalog()).find(t => t.name === name)
  if (!tool) throw new Error(`Unknown tool '${name}'`)
  let validate = validators.get(name)
  if (!validate) { validate = ajv.compile(tool.inputSchema); validators.set(name, validate) }
  if (!validate(args)) throw new Error(`Invalid arguments: ${ajv.errorsText(validate.errors)}`)
  assertOperation(args)
  return tool
}

export async function getCapabilities() {
  return { version: MCP_VERSION, tools: await getToolCatalog(), objectKinds: layerRegistry.getAll().map(d => ({ kind: d.kind, label: d.label, category: d.category, properties: d.getPropertyGroups(d.createDefault()) })), particlePresets: getAllParticlePresets().map(p => ({ id: p.id, name: p.name })), limits: LIMITS, scripting: SCRIPT_HELP, exports: ['portable project JSON', 'runtime JSON', 'PNG preview', 'SVG', 'image sequence ZIP', 'stereo WAV audio preview and mixdown'] }
}
