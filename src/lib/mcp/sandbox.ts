import { getQuickJS } from 'quickjs-emscripten'
import type { ChronoScene } from '../types'
import { createSceneAPI } from '../script/api/SceneAPI'
import { LayerHandle } from '../script/api/LayerHandle'
import { TimelineHandle } from '../script/api/TimelineHandle'
import { StateMachineHandle } from '../script/api/StateMachineHandle'
import { assertCloneBudget, assertOperation, assertScene, LIMITS } from './protocol'
import { isColorTarget } from '../animation/typedValues'

const facade = `
(() => {
  const invoke = __choronoInvoke;
  delete globalThis.__choronoInvoke;
  const call = (op, ...args) => {
    const payload = JSON.stringify({op, args}, (key, value) => {
      const type = typeof value;
      if (type === 'function' || type === 'symbol' || type === 'bigint' || (type === 'number' && !Number.isFinite(value))) throw new Error('Script arguments must be finite JSON values; functions, symbols and bigint are unsupported.');
      return value;
    });
    const result = JSON.parse(invoke(payload));
    if (result.error) throw new Error(result.error);
    return result.value;
  };
  class Layer {
    constructor(id) { this.id = id; }
    get data() { return call('layer.get', this.id, 'data'); }
    get particles() { return new Particles(this.id); }
    get spline() { return new Spline(this.id); }
    get(path) { return call('layer.method', this.id, 'get', path); }
    set(patch) { call('layer.method', this.id, 'set', patch); return this; }
    patch(patch) { call('layer.method', this.id, 'patch', patch); return this; }
    parent(parent) { call('layer.method', this.id, 'parent', parent == null ? null : typeof parent === 'string' ? parent : parent.id); return this; }
    splitAudio(...args) { return new Layer(call('layer.method', this.id, 'splitAudio', ...args)); }
  }
  for (const property of ['pos','opacity','rotation','scale','size','fill','text','cornerRadius','blendMode','name','type']) {
    Object.defineProperty(Layer.prototype, property, { get() { return call('layer.get', this.id, property); }, set(value) { call('layer.set', this.id, property, value); } });
  }
  for (const method of ['font','stroke','shapeParam','interactive','followPath','configureParticles','key','audioGain','audioFades','moveAudio','trimAudio']) {
    Layer.prototype[method] = function(...args) { call('layer.method', this.id, method, ...args); return this; };
  }
  class Timeline {
    constructor(id) { this.id = id; }
    get data() { return call('timeline.data', this.id); }
    key(layer, ...args) { call('timeline.method', this.id, 'key', typeof layer === 'string' ? layer : layer.id, ...args); return this; }
  }
  for (const method of ['set','track','removeTrack','modifier','bake']) Timeline.prototype[method] = function(...args) { call('timeline.method', this.id, method, ...args); return this; };
  class Machine {
    constructor(id) { this.id = id; }
    get data() { return call('machine.data', this.id); }
    addState(...args) { return call('machine.method', this.id, 'addState', ...args); }
    addTransition(...args) { call('machine.method', this.id, 'addTransition', ...args); return this; }
    setInitial(...args) { call('machine.method', this.id, 'setInitial', ...args); return this; }
    remove() { call('machine.method', this.id, 'remove'); }
  }
  for (const method of ['set','updateState','removeState','updateTransition','removeTransition']) Machine.prototype[method] = function(...args) { call('machine.method', this.id, method, ...args); return this; };
  class Particles {
    constructor(id) { this.id = id; }
  }
  for (const property of ['data','presets','motionModifiers']) Object.defineProperty(Particles.prototype, property, { get() { return call('particles.get', this.id, property); } });
  for (const method of ['getPreset','addMotionModifier']) Particles.prototype[method] = function(...args) { return call('particles.method', this.id, method, ...args); };
  for (const method of ['patch','applyPreset','emission','visual','animation','random','rendering','seed','life','lifeKey','removeLifeKey','clearLife','updateMotionModifier','removeMotionModifier']) Particles.prototype[method] = function(...args) { call('particles.method', this.id, method, ...args); return this; };
  class Spline {
    constructor(id) { this.id = id; }
    get layerId() { return this.id; }
  }
  for (const property of ['data','bounds']) Object.defineProperty(Spline.prototype, property, { get() { return call('spline.get', this.id, property); } });
  for (const method of ['getPoint','getHandle','getSegment','getContour','getSubShape','appendPrimitive','addContour','addPoint','setHandle','splitSegment']) Spline.prototype[method] = function(...args) { return call('spline.method', this.id, method, ...args); };
  for (const method of ['movePoint','removePoint','setPointType','setPointLocked','removeHandle','setHandleLocked','setSegmentType','setQuadraticControl','setContourClosed','reverseContour','removeContour','removeSubShape','setSubShape','setFillRule','transform']) Spline.prototype[method] = function(...args) { call('spline.method', this.id, method, ...args); return this; };
  class Explorer {}
  for (const property of ['tree','roots','nodes']) Object.defineProperty(Explorer.prototype, property, { get() { return call('explorer.get', property); } });
  for (const method of ['node','query','children','ancestors','descendants','group','ungroup','reparent','rename','reorder','moveBefore','moveAfter','setFlags']) Explorer.prototype[method] = function(...args) { return call('explorer.method', method, ...args); };
  const explorer = Object.freeze(new Explorer());
  const scene = {
    get explorer() { return explorer; },
    add: kind => new Layer(call('scene.add', kind)),
    get: id => { const found = call('scene.get', id); return found ? new Layer(found) : null; },
    find: name => { const found = call('scene.find', name); return found ? new Layer(found) : null; },
    get layers() { return call('scene.layers').map(id => new Layer(id)); },
    remove: layer => call('scene.remove', typeof layer === 'string' ? layer : layer.id),
    clone: (layer, ...args) => call('scene.clone', layer.id, ...args).map(id => new Layer(id)),
    array: (layer, ...args) => call('scene.array', layer.id, ...args).map(id => new Layer(id)),
    addEmitter: (...args) => new Layer(call('scene.addEmitter', ...args)),
    addPath: (...args) => new Layer(call('scene.addPath', ...args)),
    addSpline: (...args) => { const id = call('scene.addSpline', ...args); return id ? new Layer(id) : null; },
    composition: (...args) => call('scene.composition', ...args),
    get timelines() { return call('scene.timelines'); },
    createTimeline: (...args) => new Timeline(call('scene.createTimeline', ...args)),
    timeline: id => new Timeline(call('scene.timeline', id)),
    useTimeline: id => new Timeline(call('scene.useTimeline', id)),
    cloneTimeline: (...args) => new Timeline(call('scene.cloneTimeline', ...args)),
    deleteTimeline: id => call('scene.deleteTimeline', id),
    addStateMachine: (...args) => new Machine(call('scene.addStateMachine', ...args)),
    stateMachine: id => new Machine(call('scene.stateMachine', id)),
    audioClip: (...args) => new Layer(call('scene.audioClip', ...args)),
    snapshot: () => call('scene.snapshot'),
    addParam: (...args) => call('scene.addParam', ...args),
    addTrigger: (...args) => call('scene.addTrigger', ...args),
    wire: (...args) => call('scene.wire', ...args),
    log: (...args) => call('scene.log', ...args),
  };
  for (const collection of ['assets','assetCollections','parameters','triggers','bindings','parameterWires','stateMachines','initialState','particlePresets']) Object.defineProperty(scene, collection, { get() { return call('scene.' + collection); } });
  for (const method of ['setInitialState','editEntity','removeStateMachine','updateParam','removeParam','updateTrigger','removeTrigger','updateWire','removeWire','addBinding','updateBinding','removeBinding']) scene[method] = (...args) => call('scene.' + method, ...args);
  globalThis.scene = Object.freeze(scene);
  globalThis.console = Object.freeze({log: scene.log, warn: scene.log, error: scene.log});
})();`

export async function runSafeScript(code: string, initial: ChronoScene, timeoutMs = LIMITS.scriptMs) {
  if (typeof code !== 'string' || code.length > LIMITS.scriptBytes) throw new Error('Script size limit exceeded')
  assertScene(initial)
  const engine = await getQuickJS()
  const runtime = engine.newRuntime()
  runtime.setMemoryLimit(LIMITS.scriptMemory)
  runtime.setMaxStackSize(512 * 1024)
  const deadline = Date.now() + Math.min(Math.max(timeoutMs, 10), LIMITS.scriptMs)
  runtime.setInterruptHandler(() => Date.now() > deadline)
  const context = runtime.newContext()
  let scene = structuredClone(initial)
  let commands = 0
  let budgetError: Error | undefined
  const logs: string[] = []
  const api = createSceneAPI({ getScene: () => scene, applyCommand: cmd => {
    if (++commands > LIMITS.commands || Date.now() > deadline) throw budgetError = new Error('Script execution budget exceeded')
    scene = cmd.execute(scene)
    if (scene.layers.length > LIMITS.layers || scene.timelines.length > LIMITS.timelines) throw new Error('Scene object limit exceeded')
    const keyframes = scene.timelines.reduce((n, tl) => n + tl.tracks.reduce((m, tr) => m + tr.keyframes.length, 0), 0)
    if (keyframes > LIMITS.keyframes) throw budgetError = new Error('Keyframe limit exceeded')
  } }, line => { if (logs.length < 200 && line.length < 4096) logs.push(line) })
  const layerMethods = new Set(['get', 'set', 'patch', 'font', 'stroke', 'shapeParam', 'parent', 'interactive', 'followPath', 'configureParticles', 'key', 'audioGain', 'audioFades', 'moveAudio', 'trimAudio', 'splitAudio'])
  const layerProperties = new Set(['data', 'pos', 'opacity', 'rotation', 'scale', 'size', 'fill', 'text', 'cornerRadius', 'blendMode', 'name', 'type'])
  const sceneCollections = new Set(['assets', 'assetCollections', 'parameters', 'triggers', 'bindings', 'parameterWires', 'stateMachines', 'initialState', 'particlePresets'])
  const timelineMethods = new Set(['set', 'track', 'removeTrack', 'modifier', 'bake', 'key'])
  const particleProperties = new Set(['data', 'presets', 'motionModifiers'])
  const particleMethods = new Set(['getPreset', 'patch', 'applyPreset', 'emission', 'visual', 'animation', 'random', 'rendering', 'seed', 'life', 'lifeKey', 'removeLifeKey', 'clearLife', 'addMotionModifier', 'updateMotionModifier', 'removeMotionModifier'])
  const splineProperties = new Set(['data', 'bounds'])
  const splineMethods = new Set(['getPoint', 'getHandle', 'getSegment', 'getContour', 'getSubShape', 'appendPrimitive', 'addContour', 'addPoint', 'movePoint', 'removePoint', 'setPointType', 'setPointLocked', 'setHandle', 'removeHandle', 'setHandleLocked', 'setSegmentType', 'setQuadraticControl', 'splitSegment', 'setContourClosed', 'reverseContour', 'removeContour', 'removeSubShape', 'setSubShape', 'setFillRule', 'transform'])
  const explorerProperties = new Set(['tree', 'roots', 'nodes'])
  const explorerMethods = new Set(['node', 'query', 'children', 'ancestors', 'descendants', 'group', 'ungroup', 'reparent', 'rename', 'reorder', 'moveBefore', 'moveAfter', 'setFlags'])

  const bridge = context.newFunction('__choronoInvoke', input => {
    try {
      const raw = context.getString(input)
      if (raw.length > LIMITS.sceneBytes || Date.now() > deadline) throw new Error('Script execution budget exceeded')
      const { op, args } = JSON.parse(raw)
      const colorValueIndex = op === 'layer.method' && args[1] === 'key' && isColorTarget(args[2]) ? 4
        : op === 'timeline.method' && args[1] === 'key' && isColorTarget(args[3]) ? 5
        : op === 'particles.method' && args[1] === 'lifeKey' && args[2] === 'color' ? 4 : undefined
      assertOperation(args, { colorValueIndex,
        colorTarget: (op === 'timeline.method' && args[1] === 'track' && isColorTarget(args[2]))
          || (op === 'particles.method' && ['life', 'lifeKey'].includes(args[1]) && args[2] === 'color'),
        uint32ValueIndex: op === 'particles.method' && args[1] === 'seed' ? 2 : undefined })
      let value: any
      if (op === 'explorer.get' && explorerProperties.has(args[0])) value = (api.explorer as unknown as Record<string, unknown>)[args[0]]
      else if (op === 'explorer.method' && explorerMethods.has(args[0])) {
        const handle = api.explorer
        value = ((handle as unknown as Record<string, Function>)[args[0]]).apply(handle, args.slice(1))
        if (value === handle) value = null
      } else if (op === 'spline.get' || op === 'spline.method' || op === 'particles.get' || op === 'particles.method') {
        const layer = api.get(args[0])
        if (!layer) throw new Error('Layer not found')
        const spline = op.startsWith('spline.')
        const handle = spline ? layer.spline : layer.particles
        const properties = spline ? splineProperties : particleProperties
        const methods = spline ? splineMethods : particleMethods
        if (op.endsWith('.get') && properties.has(args[1])) value = (handle as unknown as Record<string, unknown>)[args[1]]
        else if (op.endsWith('.method') && methods.has(args[1])) value = ((handle as unknown as Record<string, Function>)[args[1]]).apply(handle, args.slice(2))
        else throw new Error('Unsupported domain operation')
        if (value === handle) value = null
      } else if (op === 'scene.layers') value = api.layers.map(l => l.id)
      else if (op === 'scene.timelines') value = api.timelines
      else if (op === 'scene.snapshot') value = api.snapshot()
      else if (op.startsWith('scene.') && sceneCollections.has(op.slice(6))) value = api[op.slice(6) as 'assets']
      else if (op === 'scene.addStateMachine') {
        const machine = api.addStateMachine(...args as [string?])
        value = machine.id
      } else if (op === 'scene.remove' || op === 'scene.clone' || op === 'scene.array') {
        const handle = api.get(args[0])
        if (!handle) throw new Error('Layer not found')
        if (op === 'scene.clone') assertCloneBudget(scene, handle.id, args[1] ?? 1)
        if (op === 'scene.array') {
          const options = args[1] ?? {}
          assertCloneBudget(scene, handle.id, options.pattern === 'grid' ? (options.rows ?? 3) * (options.columns ?? 3) : (options.count ?? 10))
        }
        value = (api[op.slice(6) as 'clone'] as Function)(handle, ...args.slice(1))
        if (Array.isArray(value)) value = value.map((l: LayerHandle) => l.id)
      } else if (op.startsWith('scene.') && ['add', 'get', 'find', 'addEmitter', 'addPath', 'addSpline', 'composition', 'createTimeline', 'timeline', 'useTimeline', 'cloneTimeline', 'deleteTimeline', 'addParam', 'addTrigger', 'wire', 'log', 'stateMachine', 'removeStateMachine', 'audioClip', 'setInitialState', 'editEntity', 'updateParam', 'removeParam', 'updateTrigger', 'removeTrigger', 'updateWire', 'removeWire', 'addBinding', 'updateBinding', 'removeBinding'].includes(op.slice(6))) {
        value = (api[op.slice(6) as 'add'] as Function)(...args)
        if (value instanceof LayerHandle || value instanceof TimelineHandle || value instanceof StateMachineHandle) value = value.id
      } else if (op.startsWith('layer.')) {
        const handle = api.get(args[0])
        if (!handle) throw new Error('Layer not found')
        const name = args[1]
        if (op === 'layer.method' && layerMethods.has(name)) value = (handle[name as 'set'] as Function).apply(handle, args.slice(2))
        else if (op === 'layer.get' && layerProperties.has(name)) value = handle[name as 'pos']
        else if (op === 'layer.set' && layerProperties.has(name) && !['id', 'name', 'type', 'data'].includes(name)) (handle as any)[name] = args[2]
        else throw new Error('Unsupported layer operation')
        if (value instanceof LayerHandle) value = value.id
      } else if (op.startsWith('timeline.')) {
        const handle = api.timeline(args[0])
        if (op === 'timeline.data') value = handle.data
        else if (op === 'timeline.method' && timelineMethods.has(args[1])) {
          if (args[1] === 'bake' && handle.data.durationMs / 1000 * (args[3] ?? 60) > LIMITS.keyframes) throw new Error('Bake sample limit exceeded')
          value = (handle[args[1] as 'set'] as Function).apply(handle, args.slice(2))
        }
        else throw new Error('Unsupported timeline operation')
        if (value instanceof TimelineHandle) value = value.id
      } else if (op === 'machine.data' || (op === 'machine.method' && ['set', 'remove', 'addState', 'updateState', 'removeState', 'addTransition', 'updateTransition', 'removeTransition', 'setInitial'].includes(args[1]))) {
        const handle = api.stateMachine(args[0])
        value = op === 'machine.data' ? handle.data : (handle[args[1] as 'addState'] as Function).apply(handle, args.slice(2))
        if (value instanceof StateMachineHandle) value = value.id
      } else throw new Error('Unsupported script operation')
      return context.newString(JSON.stringify({ value: value ?? null }))
    } catch (error) {
      return context.newString(JSON.stringify({ error: (error as Error).message }))
    }
  })
  context.setProp(context.global, '__choronoInvoke', bridge)
  bridge.dispose()
  try {
    context.unwrapResult(context.evalCode(facade)).dispose()
    const result = context.evalCode(`(function(scene) { "use strict";\n${code}\n})(scene)`, 'chorono-script.js', { type: 'global' })
    if (result.error) {
      const error = context.dump(result.error)
      result.error.dispose()
      throw new Error(error.message ?? String(error))
    }
    const returned = context.dump(result.value)
    result.value.dispose()
    if (returned && typeof returned === 'object' && 'then' in returned) throw new Error('Scripts must be synchronous')
    if (budgetError) throw budgetError
    assertScene(scene)
    return { scene, logs, commandCount: commands }
  } finally {
    context.dispose()
    runtime.dispose()
  }
}
