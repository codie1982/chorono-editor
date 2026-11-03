import { getQuickJS } from 'quickjs-emscripten'
import type { ChronoScene } from '../types'
import { createSceneAPI } from '../script/api/SceneAPI'
import { LayerHandle } from '../script/api/LayerHandle'
import { TimelineHandle } from '../script/api/TimelineHandle'
import { StateMachineHandle } from '../script/api/StateMachineHandle'
import { assertCloneBudget, assertOperation, assertScene, LIMITS } from './protocol'

const facade = `
(() => {
  const invoke = __choronoInvoke;
  delete globalThis.__choronoInvoke;
  const call = (op, ...args) => {
    const result = JSON.parse(invoke(JSON.stringify({op, args})));
    if (result.error) throw new Error(result.error);
    return result.value;
  };
  class Layer {
    constructor(id) { this.id = id; }
    set(patch) { call('layer.method', this.id, 'set', patch); return this; }
    parent(parent) { call('layer.method', this.id, 'parent', parent == null ? null : typeof parent === 'string' ? parent : parent.id); return this; }
  }
  for (const property of ['pos','opacity','rotation','scale','size','fill','text','cornerRadius','blendMode','name','type']) {
    Object.defineProperty(Layer.prototype, property, { get() { return call('layer.get', this.id, property); }, set(value) { call('layer.set', this.id, property, value); } });
  }
  for (const method of ['font','stroke','shapeParam','interactive','followPath','configureParticles','key']) {
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
    addState(...args) { return call('machine.method', this.id, 'addState', ...args); }
    addTransition(...args) { call('machine.method', this.id, 'addTransition', ...args); return this; }
    setInitial(...args) { call('machine.method', this.id, 'setInitial', ...args); return this; }
  }
  const scene = {
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
    addParam: (...args) => call('scene.addParam', ...args),
    addTrigger: (...args) => call('scene.addTrigger', ...args),
    wire: (...args) => call('scene.wire', ...args),
    log: (...args) => call('scene.log', ...args),
  };
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
  const machines = new Map<string, StateMachineHandle>()
  const api = createSceneAPI({ getScene: () => scene, applyCommand: cmd => {
    if (++commands > LIMITS.commands || Date.now() > deadline) throw budgetError = new Error('Script execution budget exceeded')
    scene = cmd.execute(scene)
    if (scene.layers.length > LIMITS.layers || scene.timelines.length > LIMITS.timelines) throw new Error('Scene object limit exceeded')
    const keyframes = scene.timelines.reduce((n, tl) => n + tl.tracks.reduce((m, tr) => m + tr.keyframes.length, 0), 0)
    if (keyframes > LIMITS.keyframes) throw budgetError = new Error('Keyframe limit exceeded')
  } }, line => { if (logs.length < 200 && line.length < 4096) logs.push(line) })
  const layerMethods = new Set(['set', 'font', 'stroke', 'shapeParam', 'parent', 'interactive', 'followPath', 'configureParticles', 'key'])
  const layerProperties = new Set(['pos', 'opacity', 'rotation', 'scale', 'size', 'fill', 'text', 'cornerRadius', 'blendMode', 'name', 'type'])
  const timelineMethods = new Set(['set', 'track', 'removeTrack', 'modifier', 'bake', 'key'])

  const bridge = context.newFunction('__choronoInvoke', input => {
    try {
      const raw = context.getString(input)
      if (raw.length > LIMITS.sceneBytes || Date.now() > deadline) throw new Error('Script execution budget exceeded')
      const { op, args } = JSON.parse(raw)
      assertOperation(args)
      let value: any
      if (op === 'scene.layers') value = api.layers.map(l => l.id)
      else if (op === 'scene.timelines') value = api.timelines
      else if (op === 'scene.addStateMachine') {
        const machine = api.addStateMachine(...args as [string?])
        machines.set(machine.id, machine)
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
      } else if (op.startsWith('scene.') && ['add', 'get', 'find', 'addEmitter', 'addPath', 'addSpline', 'composition', 'createTimeline', 'timeline', 'useTimeline', 'cloneTimeline', 'deleteTimeline', 'addParam', 'addTrigger', 'wire', 'log'].includes(op.slice(6))) {
        value = (api[op.slice(6) as 'add'] as Function)(...args)
        if (value instanceof LayerHandle || value instanceof TimelineHandle) value = value.id
      } else if (op.startsWith('layer.')) {
        const handle = api.get(args[0])
        if (!handle) throw new Error('Layer not found')
        const name = args[1]
        if (op === 'layer.method' && layerMethods.has(name)) value = (handle[name as 'set'] as Function).apply(handle, args.slice(2))
        else if (op === 'layer.get' && layerProperties.has(name)) value = handle[name as 'pos']
        else if (op === 'layer.set' && layerProperties.has(name) && !['id', 'name', 'type'].includes(name)) (handle as any)[name] = args[2]
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
      } else if (op === 'machine.method' && ['addState', 'addTransition', 'setInitial'].includes(args[1])) {
        const handle = machines.get(args[0])
        if (!handle) throw new Error('State machine handle not found')
        value = (handle[args[1] as 'addState'] as Function).apply(handle, args.slice(2))
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
