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
} from '../../types'
import { LayerHandle, type ApiContext } from './LayerHandle'
import { StateMachineHandle } from './StateMachineHandle'
import { makeAddLayerCmd, makeDeleteLayerCmd } from '../../editor/commands-layer'
import { makeAddStateMachineCmd } from '../../editor/commands-statemachine'
import {
  makeAddParamCmd, makeAddTriggerCmd, makeAddParameterWireCmd,
} from '../../editor/commands-interactive'
import { makeCloneCmd, makeArrayCmd } from '../../editor/commands-clone'
import { buildArraySettings, type FlatArrayParams } from '../../array/buildArraySettings'
import type { CloneMode } from '../../clone/CloneTypes'
import { nextSMId } from '../../defaults'
import { buildEmitterLayer, type EmitterLayerOptions } from '../../particles/buildEmitterLayer'
import { layerRegistry } from '../../registry'

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
  /** Add a particle emitter from a preset (confetti, fire, snow…). */
  addEmitter(preset?: string, opts?: Omit<EmitterLayerOptions, 'preset'>): LayerHandle
  /** Duplicate a layer N times. Returns handles to the new clones. */
  clone(handle: LayerHandle, count?: number, opts?: { offsetX?: number; offsetY?: number; mode?: CloneMode }): LayerHandle[]
  /** Lay out copies of a layer in a pattern. Returns handles to the new copies. */
  array(handle: LayerHandle, opts: FlatArrayParams): LayerHandle[]
  /** Add a scene parameter. Returns the parameter id. */
  addParam(id: string, defaultValue?: SceneParameterValue, opts?: { type?: SceneParameterType; name?: string; min?: number; max?: number }): string
  /** Add an event→action trigger. */
  addTrigger(eventType: TriggerEventType, actionType: TriggerActionType, opts?: TriggerScriptOptions): void
  /** Add an expression wire from a source property to a target property. */
  wire(sourceProperty: string, targetProperty: string, expression: string, opts?: WireScriptOptions): void
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
  const ctx: ApiContext = {
    host,
    resolveTimelineId: () => host.getScene().timelines[0]?.id,
  }

  return {
    add(kind: string): LayerHandle {
      const def = layerRegistry.get(kind)
      if (!def) {
        throw new Error(
          `Unknown layer kind '${kind}'. Try: rect, circle, text, image…`,
        )
      }
      const layer = def.createDefault()
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
      const layer = buildEmitterLayer({ ...opts, preset })
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
        timeline: host.getScene().timelines[0] ?? null,
        allLayers: host.getScene().layers,
      })
      host.applyCommand(cmd)
      return cmd.result.suggestedSelection.map((id) => new LayerHandle(id, ctx))
    },

    array(handle, opts): LayerHandle[] {
      const source = host.getScene().layers.find((l) => l.id === handle.id)
      if (!source) return []
      const cmd = makeArrayCmd({
        source,
        settings: buildArraySettings(opts),
        timeline: host.getScene().timelines[0] ?? null,
        allLayers: host.getScene().layers,
      })
      host.applyCommand(cmd)
      return cmd.result.suggestedSelection.map((id) => new LayerHandle(id, ctx))
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
      host.applyCommand(makeAddParamCmd(param))
      return id
    },

    addTrigger(eventType, actionType, opts): void {
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
    },

    wire(sourceProperty, targetProperty, expression, opts): void {
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
