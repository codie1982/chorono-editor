import type { ChronoScene, StateMachineDefinition } from '../../types'
import type { EditorCommand } from '../../editor/commands-keyframe'
import { assertSafeScriptData, copyScriptData } from './scriptData'

export type ScriptEntityCollection = 'parameters' | 'triggers' | 'bindings' | 'parameterWires' | 'stateMachines'
export type ScriptEntityOperation = 'add' | 'update' | 'remove'
const collections = new Set<ScriptEntityCollection>(['parameters', 'triggers', 'bindings', 'parameterWires', 'stateMachines'])

export function validateScriptMachine(scene: ChronoScene, machine: StateMachineDefinition): void {
  if (typeof machine.name !== 'string' || !Array.isArray(machine.states) || !Array.isArray(machine.transitions)) throw new Error('Invalid state machine.')
  const states = new Set<string>(), edges = new Set<string>()
  for (const state of machine.states) {
    if (!state.id || states.has(state.id)) throw new Error('State ids must be unique.')
    states.add(state.id)
    if (!scene.timelines.some(timeline => timeline.id === state.timelineId)) throw new Error(`State timeline '${state.timelineId}' was not found.`)
    if (state.speed !== undefined && (!Number.isFinite(state.speed) || state.speed <= 0)) throw new Error('State speed must be positive and finite.')
  }
  if (machine.states.length ? !states.has(machine.initialStateId) : machine.initialStateId !== '') throw new Error('Initial state was not found.')
  for (const transition of machine.transitions) {
    if (!transition.id || edges.has(transition.id)) throw new Error('Transition ids must be unique.')
    edges.add(transition.id)
    if ((transition.from !== '*' && !states.has(transition.from)) || !states.has(transition.to)) throw new Error('Transition state was not found.')
    if (transition.blendMs !== undefined && (!Number.isFinite(transition.blendMs) || transition.blendMs < 0)) throw new Error('Transition blend must be non-negative and finite.')
  }
}

/** Same shallow record edit contract as native edit_entity, with one reversible command. */
export function makeScriptEntityEditCmd(collection: ScriptEntityCollection, operation: ScriptEntityOperation,
  id: string, value?: Record<string, unknown>): EditorCommand {
  if (!collections.has(collection) || !['add', 'update', 'remove'].includes(operation)) throw new Error('Unsupported entity operation.')
  if (typeof id !== 'string' || !id.trim()) throw new Error('Entity id must not be empty.')
  if (operation !== 'remove' && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error('Entity data must be an object.')
  assertSafeScriptData(value)
  if (value?.id !== undefined && value.id !== id) throw new Error('Cannot change an entity id.')
  const patch = copyScriptData(value)
  let before: ChronoScene | undefined
  return { label: `Script ${operation} ${collection}`, execute(scene) {
    const items = scene[collection] ?? []
    const existing = items.find(item => item.id === id)
    if (operation === 'add' ? !!existing : !existing) throw new Error('Entity must exist for update/remove, and be unique for add.')
    const next = operation === 'remove' ? undefined : { ...existing, ...patch, id }
    if (collection === 'stateMachines' && next) validateScriptMachine(scene, next as StateMachineDefinition)
    before = scene
    const list = operation === 'remove' ? items.filter(item => item.id !== id) : operation === 'add' ? [...items, next] : items.map(item => item.id === id ? next : item)
    return { ...scene, [collection]: list }
  }, undo: scene => before ?? scene }
}
