// ── StateMachineHandle (BL-09 script surface) ─────────────────────────────────
// Script-facing wrapper around one state machine id. Mirrors the AI tool layer:
// the first state added auto-becomes the initial state. addState() returns the
// new state id so transitions can reference it.
//
//   const sm = scene.addStateMachine('seasons')
//   const spring = sm.addState('spring', 'tl_spring')
//   const summer = sm.addState('summer', 'tl_summer')
//   sm.addTransition(spring, summer, 'next')

import type { ChronoSMState, BaseSMTransition, SMGuard, StateMachineDefinition } from '../../types'
import type { ApiContext } from './LayerHandle'
import {
  makeAddSMStateAutoInitCmd, makeAddSMTransitionCmd, makeSetInitialStateCmd,
} from '../../editor/commands-statemachine'
import { nextSMStateId, nextSMTransitionId } from '../../defaults'
import { copyScriptData } from './scriptData'
import { makeScriptEntityEditCmd, validateScriptMachine } from './entityCommands'

export interface TransitionOptions {
  guard?: SMGuard
  blendMs?: number
  priority?: number
  id?: string
}

export class StateMachineHandle {
  constructor(
    public readonly id: string,
    private readonly ctx: ApiContext,
  ) {}

  get data(): StateMachineDefinition {
    const machine = this.ctx.host.getScene().stateMachines?.find(item => item.id === this.id)
    if (!machine) throw new Error(`State machine '${this.id}' not found`)
    return copyScriptData(machine)
  }

  set(patch: Partial<Omit<StateMachineDefinition, 'id'>>): this {
    if ('id' in patch) throw new Error('Cannot change state machine id.')
    this.ctx.host.applyCommand(makeScriptEntityEditCmd('stateMachines', 'update', this.id, patch))
    return this
  }

  remove(): void { this.ctx.host.applyCommand(makeScriptEntityEditCmd('stateMachines', 'remove', this.id)) }

  /** Add a state bound to a timeline. Returns the new state id. */
  addState(name: string, timelineId: string, opts?: Partial<Omit<ChronoSMState, 'name' | 'timelineId'>>): string {
    const previous = this.data
    const stateId = opts?.id ?? nextSMStateId()
    const state: ChronoSMState = {
      ...copyScriptData(opts), id: stateId, name, timelineId,
    }
    validateScriptMachine(this.ctx.host.getScene(), { ...previous, states: [...previous.states, state],
      initialStateId: previous.states.some(item => item.id === previous.initialStateId) ? previous.initialStateId : stateId })
    this.ctx.host.applyCommand(makeAddSMStateAutoInitCmd(this.id, state))
    return stateId
  }

  updateState(stateId: string, patch: Partial<Omit<ChronoSMState, 'id'>>): this {
    if ('id' in patch) throw new Error('Cannot change state id.')
    const previous = this.data
    if (!previous.states.some(state => state.id === stateId)) throw new Error('State was not found.')
    return this.set({ states: previous.states.map(state => state.id === stateId ? { ...state, ...copyScriptData(patch) } : state) })
  }

  removeState(stateId: string): this {
    const previous = this.data
    if (!previous.states.some(state => state.id === stateId)) throw new Error('State was not found.')
    const states = previous.states.filter(state => state.id !== stateId)
    return this.set({ states, transitions: previous.transitions.filter(edge => edge.from !== stateId && edge.to !== stateId),
      initialStateId: previous.initialStateId === stateId ? states[0]?.id ?? '' : previous.initialStateId })
  }

  /** Connect two states. `from` may be '*' to apply from any state. */
  addTransition(from: string, to: string, event?: string, opts?: TransitionOptions): this {
    const transition: BaseSMTransition = {
      id: opts?.id ?? nextSMTransitionId(),
      from, to,
      ...(event          ? { trigger:  event }         : {}),
      ...(opts?.guard    ? { guard:    opts.guard }    : {}),
      ...(opts?.blendMs  != null ? { blendMs:  opts.blendMs }  : {}),
      ...(opts?.priority != null ? { priority: opts.priority } : {}),
    }
    const previous = this.data
    validateScriptMachine(this.ctx.host.getScene(), { ...previous, transitions: [...previous.transitions, transition] })
    this.ctx.host.applyCommand(makeAddSMTransitionCmd(this.id, transition))
    return this
  }

  updateTransition(transitionId: string, patch: Partial<Omit<BaseSMTransition, 'id'>>): this {
    if ('id' in patch) throw new Error('Cannot change transition id.')
    const previous = this.data
    if (!previous.transitions.some(edge => edge.id === transitionId)) throw new Error('Transition was not found.')
    return this.set({ transitions: previous.transitions.map(edge => edge.id === transitionId ? { ...edge, ...copyScriptData(patch) } : edge) })
  }

  removeTransition(transitionId: string): this {
    const previous = this.data
    if (!previous.transitions.some(edge => edge.id === transitionId)) throw new Error('Transition was not found.')
    return this.set({ transitions: previous.transitions.filter(edge => edge.id !== transitionId) })
  }

  /** Override which state the machine starts in. */
  setInitial(stateId: string): this {
    if (!this.data.states.some(state => state.id === stateId)) throw new Error('Initial state was not found.')
    this.ctx.host.applyCommand(makeSetInitialStateCmd(this.id, stateId))
    return this
  }
}
