import Ajv from 'ajv'
import { actionRegistry } from '../ai/ActionRegistry'
import { bootstrapMCPActions } from './actions'
import { layerRegistry } from '../registry'
import { getAllParticlePresets } from '../particles/presets'
import { assertOperation, LIMITS, MCP_VERSION, type ToolDefinition, type JsonObject } from './protocol'

const string = { type: 'string' }
const number = { type: 'number', minimum: 0 }
const boolean = { type: 'boolean' }
const object = { type: 'object' }
const extra = (name: string, description: string, properties: JsonObject = {}, required: string[] = [], readOnly = false): ToolDefinition => ({ name, description, inputSchema: { type: 'object', properties, required }, annotations: { readOnlyHint: readOnly, openWorldHint: false } })
const extras: ToolDefinition[] = [
  extra('list_sessions', 'List explicitly connected Chorono editor tabs. Use sessionId when several tabs are open.', {}, [], true),
  extra('get_capabilities', 'Discover all tools, object kinds, particle presets, limits and the exact script API.', {}, [], true),
  extra('get_scene', 'Read the live editor scene plus revision, selected timeline and playhead. Read before editing existing work.', {}, [], true),
  extra('run_script', 'Execute synchronous JavaScript in isolated QuickJS. Only scene API is available; no Node, DOM, fetch, imports or filesystem. All edits are atomic. dryRun returns a planId which apply_script_plan commits without rerunning code.', { code: { type: 'string', maxLength: LIMITS.scriptBytes }, dryRun: boolean }, ['code']),
  extra('apply_script_plan', 'Commit a previously prepared script plan exactly once, retaining generated object ids. Refuses a stale scene revision.', { planId: string }, ['planId']),
  extra('batch_actions', 'Apply ordered native tools atomically as ONE undo step. run_script and transport/file tools cannot be nested here.', { actions: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', required: ['name', 'arguments'], properties: { name: string, arguments: object }, additionalProperties: false } } }, ['actions']),
  extra('render_preview', 'Return an actual PNG frame. With no timeMs/timelineIds/parameters, captures the current live state including state machines. For deterministic time-based state-machine previews specify timelineIds. parameters overrides values for this frame only.', { timeMs: number, timelineIds: { type: 'array', items: string }, width: { type: 'integer', minimum: 16, maximum: 2048 }, parameters: object }, [], true),
  extra('control_playback', 'Play, pause, stop or seek the editor; select a timeline and set speed. timelineIds isolates animations in the live viewport; [] restores all animations.', { action: { type: 'string', enum: ['play', 'pause', 'stop', 'seek'] }, timeMs: number, timelineId: string, timelineIds: { type: 'array', items: string }, speed: { type: 'number', minimum: 0.1, maximum: 4 } }, ['action']),
  extra('control_runtime', 'Set live runtime parameters and dispatch a state-machine event. Events enable runtime test ticks so transitions/blends work while paused; testMode:false stops test ticks.', { parameters: object, event: string, machineId: string, testMode: boolean }),
  extra('get_runtime', 'Read current runtime parameters, state-machine states, active timelines and playback state.', {}, [], true),
  extra('evaluate_frame', 'Evaluate timelines, bindings, parameter wiring and runtime parameters at a requested time. Returns property values without rendering pixels.', { timeMs: number, timelineIds: { type: 'array', items: string }, parameters: object }, [], true),
  extra('undo', 'Undo one editor transaction.'),
  extra('redo', 'Redo one editor transaction.'),
  extra('save_project', 'Save a portable scene JSON with local blob media embedded. Files stay inside the configured project directory. Returns exact path, bytes, revision and hash.', { name: string, overwrite: boolean }),
  extra('list_projects', 'List saved project files inside the project directory.', {}, [], true),
  extra('load_project', 'Load a saved project by file name into the current editor as one undoable change.', { name: string }, ['name']),
  extra('export_runtime', 'Save validated and optimized runtime JSON in the export directory.', { name: string }),
  extra('export_svg', 'Save an SVG export using the existing vector exporter.', { name: string, timeMs: number }),
  extra('export_sequence', 'Render a frame sequence ZIP using the editor. Bounded to 300 frames per call. Does not include audio.', { name: string, fps: { type: 'number', minimum: 1, maximum: 60 }, timelineIds: { type: 'array', items: string } }),
  extra('import_asset', 'Import a media asset supplied as base64 file content using the existing import pipeline. No arbitrary local paths or server-side URL fetches.', { name: string, mimeType: string, data: { type: 'string', maxLength: 16 * 1024 * 1024 } }, ['name', 'mimeType', 'data']),
  extra('validate_scene', 'Validate scene structure and return runtime-export diagnostics.', {}, [], true),
]

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
export function getToolCatalog(): Promise<ToolDefinition[]> {
  return catalogPromise ??= bootstrapMCPActions().then(() => {
    const special = new Set(extras.map(t => t.name))
    return [...actionRegistry.toMCPTools().filter(t => !special.has(t.name)).map(t => ({ ...t, annotations: { readOnlyHint: !!actionRegistry.get(t.name)?.read, openWorldHint: false } })), ...extras].map(t => ({ ...t, inputSchema: { ...t.inputSchema, properties: { ...t.inputSchema.properties, sessionId: string, expectedRevision: { type: 'integer', minimum: 0 }, requestId: { type: 'string', maxLength: 128 } }, additionalProperties: false } }))
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
