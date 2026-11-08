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
Layer: id/name/type getters; pos=[x,y], size=[w,h], opacity, rotation, scale=[x,y], fill, text, cornerRadius, blendMode
Layer methods: set(Partial<Layer>), font({family,size,weight,color,align}), stroke({color,width,opacity}), shapeParam(name,value), parent(handle|id|null), interactive(options), followPath(pathId,options), configureParticles(config), key(property,timeMs,value,easing)
scene.composition({width,height,durationMs,frameRate,backgroundColor}); scene.createTimeline({id,durationMs,loop,autoplay}); scene.timelines
scene.useTimeline(id) selects the timeline used by subsequent Layer.key calls. scene.timeline(id) returns Timeline; scene.cloneTimeline(id,newId); scene.deleteTimeline(id)
Timeline: id, data; set(options), key(layerOrId,property,timeMs,value,easing), track(target,patch), removeTrack(target), modifier(target,{type,parameters,weight,blendMode}), bake(target,fps,tolerance)
Easing: linear, hold, easeIn, easeOut, easeInOut or {type:'customBezier',bezier:{cx1:0.2,cy1:0,cx2:0.3,cy2:1}}. Easing is applied from the START keyframe.
scene.clone(handle,count,{offsetX,offsetY,mode}); scene.array(handle,{pattern:'radial',count:8,radius:120})
scene.addPath([[x,y],...],{role:'motion'|'visual',closed,x,y,name}); scene.addSpline(kind,params,options); layer.followPath(path.id,{orientToPath:true}); animate followPath.progress 0..1
scene.addEmitter(preset,options); scene.addParam(id,value,{type,min,max}); scene.wire(sourceProperty,targetProperty,expression,options); scene.addTrigger(eventType,actionType,options)
scene.addStateMachine(name) -> Machine; Machine.addState(name,timelineId,options) -> stateId; addTransition(from,to,event,{guard,blendMs,priority}); setInitial(stateId)
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
  return { version: MCP_VERSION, tools: await getToolCatalog(), objectKinds: layerRegistry.getAll().map(d => ({ kind: d.kind, label: d.label, category: d.category, properties: d.getPropertyGroups(d.createDefault()) })), particlePresets: getAllParticlePresets().map(p => ({ id: p.id, name: p.name })), limits: LIMITS, scripting: SCRIPT_HELP, exports: ['portable project JSON', 'runtime JSON', 'PNG preview', 'SVG', 'image sequence ZIP'] }
}
