// ── SceneAPI (BL-76) ──────────────────────────────────────────────────────────
// The `scene` object exposed to authoring scripts. Wraps the existing command
// system so script edits get full undo/redo + scene consistency for free.
//
// Designed mode-agnostic: a future Game Engine mode can expose the same shape
// with its own object kinds + handle type (see arch_scripting_event_system memo).

import type { ScriptHost } from '../types'
import type {
  StateMachineDefinition, SceneParameter, SceneParameterType, SceneParameterValue,
  Trigger, TriggerEventType, TriggerActionType, ParameterWire, ParameterValueType,
  ChronoScene, Layer, Binding, Asset,
} from '../../types'
import { LayerHandle, type ApiContext } from './LayerHandle'
import { StateMachineHandle } from './StateMachineHandle'
import { TimelineHandle } from './TimelineHandle'
import { makeAddTimelineCmd, makeDeleteTimelineCmd } from '../../editor/commands-timeline'
import type { AuthoringHints } from '../../types/authoring'
import { cloneTimeline } from '../../timeline/cloneTimeline'
import type { Composition, Timeline } from '../../types'
import { makeAddLayerCmd, makeDeleteLayerCmd } from '../../editor/commands-layer'
import { makeAddStateMachineCmd } from '../../editor/commands-statemachine'
import {
  makeAddParamCmd, makeAddTriggerCmd, makeAddParameterWireCmd,
} from '../../editor/commands-interactive'
import { makeCloneCmd, makeArrayCmd } from '../../editor/commands-clone'
import { buildArraySettings, type FlatArrayParams } from '../../array/buildArraySettings'
import type { CloneMode } from '../../clone/CloneTypes'
import { pathFromPoints } from '../../types/path'
import type { SplineGeneratorParams, SplinePrimitiveKind } from '../../types'
import {
  nextSMId, newBezierPathLayer, newMotionPathLayer, newSplineLayerFromPrimitive, newAudioLayer,
} from '../../defaults'
import { buildEmitterLayer, type EmitterLayerOptions } from '../../particles/buildEmitterLayer'
import { layerRegistry } from '../../registry'
import { copyScriptData } from './scriptData'
import { makeScriptEntityEditCmd, type ScriptEntityCollection, type ScriptEntityOperation } from './entityCommands'
import { makeAddAudioClipCmd, type AddAudioClipOptions } from '../../editor/commands-audio'
import { ExplorerAPI } from './ExplorerAPI'
import { listScriptParticlePresets } from './ParticleHandle'

export interface TriggerScriptOptions {
  layerId?: string
  timelineId?: string
  paramId?: string
  paramValue?: SceneParameterValue
  label?: string
}

export interface WireScriptOptions {
  sourceLayerId?: string
  targetLayerId?: string
  valueType?: ParameterValueType
  name?: string
  blendMode?: 'override' | 'add'
}

let scriptInteractiveSeq = 0
const scriptUid = (p: string) => `${p}_script_${Date.now()}_${++scriptInteractiveSeq}`

export interface SceneAPI {
  snapshot(): ChronoScene
  readonly explorer: ExplorerAPI
  readonly particlePresets: ReturnType<typeof listScriptParticlePresets>
  readonly assets: Asset[]
  readonly assetCollections: NonNullable<ChronoScene['assetCollections']>
  readonly parameters: SceneParameter[]
  readonly triggers: Trigger[]
  readonly bindings: Binding[]
  readonly parameterWires: ParameterWire[]
  readonly stateMachines: StateMachineDefinition[]
  readonly initialState: ChronoScene['initialState']
  setInitialState(value: ChronoScene['initialState']): void
  editEntity(collection: ScriptEntityCollection, operation: ScriptEntityOperation, id: string, value?: Record<string, unknown>): void
  composition(patch?: Partial<Composition>): Composition
  readonly timelines: Timeline[]
  createTimeline(options: { id: string; durationMs?: number; loop?: boolean; autoplay?: boolean }): TimelineHandle
  timeline(id: string): TimelineHandle
  useTimeline(id: string): TimelineHandle
  deleteTimeline(id: string): void
  cloneTimeline(id: string, newId: string): TimelineHandle
  /** Create a layer of the given kind (e.g. 'rect', 'circle', 'text'). */
  add(kind: string): LayerHandle
  /** Find the first layer with the given name. */
  find(name: string): LayerHandle | null
  /** Get a layer handle by id. */
  get(id: string): LayerHandle | null
  /** All layers as handles (read-only snapshot). */
  readonly layers: LayerHandle[]
  /** Delete a layer. */
  remove(handle: LayerHandle): void
  /** Create a state machine. Add states/transitions via the returned handle. */
  addStateMachine(name?: string): StateMachineHandle
  stateMachine(id: string): StateMachineHandle
  removeStateMachine(id: string): void
  audioClip(assetId: string, options?: Omit<AddAudioClipOptions, 'layer' | 'preserveDuration'>): LayerHandle
  /** Add a particle emitter from a preset (confetti, fire, snow…). */
  addEmitter(preset?: string, opts?: Omit<EmitterLayerOptions, 'preset'>): LayerHandle
  /** Duplicate a layer N times. Returns handles to the new clones. */
  clone(handle: LayerHandle, count?: number, opts?: { offsetX?: number; offsetY?: number; mode?: CloneMode; timelineId?: string }): LayerHandle[]
  /** Lay out copies of a layer in a pattern. Returns handles to the new copies. */
  array(handle: LayerHandle, opts: FlatArrayParams, options?: { timelineId?: string }): LayerHandle[]
  /** Add a bezier path layer from [x,y] points. Returns the path handle. */
  addPath(points: [number, number][], opts?: { closed?: boolean; role?: 'visual' | 'motion'; x?: number; y?: number; name?: string }): LayerHandle
  /** Add an editable spline primitive (circle/rect/ellipse/arc/donut/ngon/star/line). */
  addSpline(kind: SplinePrimitiveKind, params: SplineGeneratorParams, opts?: { x?: number; y?: number; name?: string }): LayerHandle | null
  /** Add a scene parameter. Returns the parameter id. */
  addParam(id: string, defaultValue?: SceneParameterValue, opts?: { type?: SceneParameterType; name?: string; min?: number; max?: number }): string
  /** Add an event→action trigger. */
  addTrigger(eventType: TriggerEventType, actionType: TriggerActionType, opts?: TriggerScriptOptions): string
  /** Add an expression wire from a source property to a target property. */
  wire(sourceProperty: string, targetProperty: string, expression: string, opts?: WireScriptOptions): string
  updateParam(id: string, patch: Partial<Omit<SceneParameter, 'id'>>): void
  removeParam(id: string): void
  updateTrigger(id: string, patch: Partial<Omit<Trigger, 'id'>>): void
  removeTrigger(id: string): void
  updateWire(id: string, patch: Partial<Omit<ParameterWire, 'id'>>): void
  removeWire(id: string): void
  addBinding(binding: Binding): string
  updateBinding(id: string, patch: Partial<Omit<Binding, 'id'>>): void
  removeBinding(id: string): void
  /** Append a line to the script output console. */
  log(...args: unknown[]): void
}

/**
 * Build the `scene` API object for one script run.
 * @param host       bridge to editor (getScene + applyCommand)
 * @param collectLog sink for scene.log() output
 */
export function createSceneAPI(
  host: ScriptHost,
  collectLog: (line: string) => void,
): SceneAPI {
  let activeTimelineId: string | undefined
  function uniqueLayer<T extends { id: string }>(layer: T): T {
    while (host.getScene().layers.some(l => l.id === layer.id)) layer = { ...layer, id: scriptUid('layer') }
    return layer
  }
  const ctx: ApiContext = {
    host,
    resolveTimelineId: () => activeTimelineId ?? host.getScene().timelines[0]?.id,
  }
  const explorer = new ExplorerAPI(ctx)
  const editEntity: SceneAPI['editEntity'] = (collection, operation, id, value) => host.applyCommand(makeScriptEntityEditCmd(collection, operation, id, value))
  const resolveTimeline = (id?: string) => {
    const resolved = id ?? ctx.resolveTimelineId()
    const timeline = host.getScene().timelines.find(item => item.id === resolved)
    if (id !== undefined && !timeline) throw new Error(`Timeline '${id}' not found`)
    return timeline ?? null
  }

  return {
    snapshot: () => copyScriptData(host.getScene()),
    get explorer() { return explorer },
    get particlePresets() { return listScriptParticlePresets() },
    get assets() { return copyScriptData(host.getScene().assets) },
    get assetCollections() { return copyScriptData(host.getScene().assetCollections ?? []) },
    get parameters() { return copyScriptData(host.getScene().parameters) },
    get triggers() { return copyScriptData(host.getScene().triggers) },
    get bindings() { return copyScriptData(host.getScene().bindings) },
    get parameterWires() { return copyScriptData(host.getScene().parameterWires ?? []) },
    get stateMachines() { return copyScriptData(host.getScene().stateMachines ?? []) },
    get initialState() { return copyScriptData(host.getScene().initialState) },
    setInitialState(value) {
      const previous = host.getScene().initialState
      const next = copyScriptData(value)
      host.applyCommand({ label: 'Script initial state', execute: scene => ({ ...scene, initialState: next }), undo: scene => ({ ...scene, initialState: previous }) })
    },
    editEntity,
    updateParam: (id, patch) => editEntity('parameters', 'update', id, patch),
    removeParam: id => editEntity('parameters', 'remove', id),
    updateTrigger: (id, patch) => editEntity('triggers', 'update', id, patch),
    removeTrigger: id => editEntity('triggers', 'remove', id),
    updateWire: (id, patch) => editEntity('parameterWires', 'update', id, patch),
    removeWire: id => editEntity('parameterWires', 'remove', id),
    addBinding(binding) { editEntity('bindings', 'add', binding.id, binding as unknown as Record<string, unknown>); return binding.id },
    updateBinding: (id, patch) => editEntity('bindings', 'update', id, patch),
    removeBinding: id => editEntity('bindings', 'remove', id),
    stateMachine(id) {
      if (!host.getScene().stateMachines?.some(machine => machine.id === id)) throw new Error(`State machine '${id}' not found`)
      return new StateMachineHandle(id, ctx)
    },
    removeStateMachine: id => editEntity('stateMachines', 'remove', id),
    audioClip(assetId, options = {}) {
      const asset = host.getScene().assets.find(item => item.id === assetId && item.type === 'audio')
      if (!asset) throw new Error('Audio source was not found.')
      const layer = newAudioLayer(asset.id, asset.durationMs)
      host.applyCommand(makeAddAudioClipCmd(asset, { ...options, layer, timelineId: options.timelineId ?? ctx.resolveTimelineId() }))
      return new LayerHandle(options.layerId ?? layer.id, ctx)
    },
    composition(patch) {
      const prev = host.getScene().composition
      if (patch) host.applyCommand({ label: 'Script composition', execute: scene => ({ ...scene, composition: { ...prev, ...patch } }), undo: scene => ({ ...scene, composition: prev }) })
      return copyScriptData(host.getScene().composition)
    },
    get timelines() { return copyScriptData(host.getScene().timelines) },
    createTimeline(options) {
      if (!options.id || host.getScene().timelines.some(t => t.id === options.id)) throw new Error('Timeline id must be unique')
      host.applyCommand(makeAddTimelineCmd({ id: options.id, durationMs: options.durationMs ?? host.getScene().composition.durationMs, loop: options.loop ?? false, autoplay: options.autoplay ?? false, tracks: [], layerIds: [] }))
      return new TimelineHandle(options.id, ctx)
    },
    timeline(id) {
      if (!host.getScene().timelines.some(t => t.id === id)) throw new Error(`Timeline '${id}' not found`)
      return new TimelineHandle(id, ctx)
    },
    useTimeline(id) {
      if (!host.getScene().timelines.some(t => t.id === id)) throw new Error(`Timeline '${id}' not found`)
      activeTimelineId = id
      return new TimelineHandle(id, ctx)
    },
    deleteTimeline(id) {
      const timeline = host.getScene().timelines.find(t => t.id === id)
      if (!timeline) throw new Error(`Timeline '${id}' not found`)
      if (host.getScene().stateMachines?.some(sm => sm.states.some(s => s.timelineId === id))) throw new Error('Timeline is referenced by a state machine')
      host.applyCommand(makeDeleteTimelineCmd(timeline))
      if (activeTimelineId === id) activeTimelineId = undefined
    },
    cloneTimeline(id, newId) {
      const copies: NonNullable<AuthoringHints['copies']>[number][] = []
      const timeline = cloneTimeline(host.getScene(), id, newId, copies)
      host.applyCommand({ ...makeAddTimelineCmd(timeline), authoring: { copies } })
      return new TimelineHandle(newId, ctx)
    },
    add(kind: string): LayerHandle {
      const def = layerRegistry.get(kind)
      if (!def) {
        throw new Error(
          `Unknown layer kind '${kind}'. Try: rect, circle, text, image…`,
        )
      }
      const layer = uniqueLayer(def.createDefault())
      host.applyCommand(makeAddLayerCmd(layer))
      return new LayerHandle(layer.id, ctx)
    },

    find(name: string): LayerHandle | null {
      const layer = host.getScene().layers.find((l) => l.name === name)
      return layer ? new LayerHandle(layer.id, ctx) : null
    },

    get(id: string): LayerHandle | null {
      const layer = host.getScene().layers.find((l) => l.id === id)
      return layer ? new LayerHandle(layer.id, ctx) : null
    },

    get layers(): LayerHandle[] {
      return host.getScene().layers.map((l) => new LayerHandle(l.id, ctx))
    },

    remove(handle: LayerHandle): void {
      const layer = host.getScene().layers.find((l) => l.id === handle.id)
      if (layer) host.applyCommand(makeDeleteLayerCmd(layer))
    },

    addStateMachine(name?: string): StateMachineHandle {
      const id = nextSMId()
      const sm: StateMachineDefinition = {
        id, name: name ?? id, initialStateId: '', states: [], transitions: [],
      }
      host.applyCommand(makeAddStateMachineCmd(sm))
      return new StateMachineHandle(id, ctx)
    },

    addEmitter(preset?: string, opts?: Omit<EmitterLayerOptions, 'preset'>): LayerHandle {
      const layer = uniqueLayer(buildEmitterLayer({ ...opts, preset }))
      host.applyCommand(makeAddLayerCmd(layer))
      return new LayerHandle(layer.id, ctx)
    },

    clone(handle, count = 1, opts): LayerHandle[] {
      const source = host.getScene().layers.find((l) => l.id === handle.id)
      if (!source) return []
      const cmd = makeCloneCmd({
        source, count,
        ...(opts?.offsetX != null ? { offsetX: opts.offsetX } : {}),
        ...(opts?.offsetY != null ? { offsetY: opts.offsetY } : {}),
        ...(opts?.mode ? { mode: opts.mode } : {}),
        timeline: resolveTimeline(opts?.timelineId),
        allLayers: host.getScene().layers,
      })
      host.applyCommand(cmd)
      return cmd.result.suggestedSelection.map((id) => new LayerHandle(id, ctx))
    },

    array(handle, opts, options): LayerHandle[] {
      const source = host.getScene().layers.find((l) => l.id === handle.id)
      if (!source) return []
      const cmd = makeArrayCmd({
        source,
        settings: buildArraySettings(opts),
        timeline: resolveTimeline(options?.timelineId),
        allLayers: host.getScene().layers,
      })
      host.applyCommand(cmd)
      return cmd.result.suggestedSelection.map((id) => new LayerHandle(id, ctx))
    },

    addPath(points, opts): LayerHandle {
      const base = opts?.role === 'motion' ? newMotionPathLayer() : newBezierPathLayer()
      const layer = uniqueLayer({
        ...base,
        ...(opts?.name ? { name: opts.name } : {}),
        transform: { ...base.transform, x: opts?.x ?? base.transform.x, y: opts?.y ?? base.transform.y },
        path: pathFromPoints(points, opts?.closed ?? false),
      })
      host.applyCommand(makeAddLayerCmd(layer))
      return new LayerHandle(layer.id, ctx)
    },

    addSpline(kind, params, opts): LayerHandle | null {
      const base = newSplineLayerFromPrimitive(kind, params)
      if (!base) return null
      const layer = uniqueLayer({
        ...base,
        ...(opts?.name ? { name: opts.name } : {}),
        transform: { ...base.transform, x: opts?.x ?? base.transform.x, y: opts?.y ?? base.transform.y },
      })
      host.applyCommand(makeAddLayerCmd(layer))
      return new LayerHandle(layer.id, ctx)
    },

    addParam(id, defaultValue, opts): string {
      const type: SceneParameterType = opts?.type
        ?? (typeof defaultValue === 'boolean' ? 'boolean'
          : typeof defaultValue === 'string' ? 'string' : 'number')
      const param: SceneParameter = {
        id, name: opts?.name ?? id, type,
        defaultValue: defaultValue ?? (type === 'number' ? 0 : type === 'boolean' ? false : ''),
        ...(type === 'number' && opts?.min != null ? { min: opts.min } : {}),
        ...(type === 'number' && opts?.max != null ? { max: opts.max } : {}),
      }
      editEntity('parameters', 'add', id, param as unknown as Record<string, unknown>)
      return id
    },

    addTrigger(eventType, actionType, opts): string {
      const trigger: Trigger = {
        id: scriptUid('trigger'),
        ...(opts?.label ? { label: opts.label } : {}),
        event: { type: eventType, ...(opts?.layerId ? { layerId: opts.layerId } : {}), ...(opts?.timelineId ? { timelineId: opts.timelineId } : {}) },
        actions: [{
          type: actionType,
          ...(opts?.timelineId ? { timelineId: opts.timelineId } : {}),
          ...(opts?.paramId ? { paramId: opts.paramId } : {}),
          ...(opts?.paramValue != null ? { paramValue: opts.paramValue } : {}),
        }],
      }
      host.applyCommand(makeAddTriggerCmd(trigger))
      return trigger.id
    },

    wire(sourceProperty, targetProperty, expression, opts): string {
      const now = Date.now()
      const wire: ParameterWire = {
        id: scriptUid('wire'),
        ...(opts?.name ? { name: opts.name } : {}),
        enabled: true,
        source: { ...(opts?.sourceLayerId ? { layerId: opts.sourceLayerId } : {}), propertyPath: sourceProperty, valueType: opts?.valueType ?? 'number' },
        target: { ...(opts?.targetLayerId ? { layerId: opts.targetLayerId } : {}), propertyPath: targetProperty, valueType: opts?.valueType ?? 'number' },
        expression,
        blendMode: opts?.blendMode ?? 'override',
        createdAt: now, updatedAt: now,
      }
      host.applyCommand(makeAddParameterWireCmd(wire))
      return wire.id
    },

    log(...args: unknown[]): void {
      collectLog(
        args
          .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
          .join(' '),
      )
    },
  }
}
