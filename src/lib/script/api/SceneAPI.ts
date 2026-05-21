// ── SceneAPI (BL-76) ──────────────────────────────────────────────────────────
// The `scene` object exposed to authoring scripts. Wraps the existing command
// system so script edits get full undo/redo + scene consistency for free.
//
// Designed mode-agnostic: a future Game Engine mode can expose the same shape
// with its own object kinds + handle type (see arch_scripting_event_system memo).

import type { ScriptHost } from '../types'
import type { StateMachineDefinition } from '../../types'
import { LayerHandle, type ApiContext } from './LayerHandle'
import { StateMachineHandle } from './StateMachineHandle'
import { makeAddLayerCmd, makeDeleteLayerCmd } from '../../editor/commands-layer'
import { makeAddStateMachineCmd } from '../../editor/commands-statemachine'
import { nextSMId } from '../../defaults'
import { buildEmitterLayer, type EmitterLayerOptions } from '../../particles/buildEmitterLayer'
import { layerRegistry } from '../../registry'

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

    log(...args: unknown[]): void {
      collectLog(
        args
          .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
          .join(' '),
      )
    },
  }
}
