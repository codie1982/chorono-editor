// ── StateMachineHandle (BL-09 script surface) ─────────────────────────────────
// Script-facing wrapper around one state machine id. Mirrors the AI tool layer:
// the first state added auto-becomes the initial state. addState() returns the
// new state id so transitions can reference it.
//
//   const sm = scene.addStateMachine('seasons')
//   const spring = sm.addState('spring', 'tl_spring')
//   const summer = sm.addState('summer', 'tl_summer')
//   sm.addTransition(spring, summer, 'next')

import type { ChronoSMState, BaseSMTransition, SMGuard } from '../../types'
import type { ApiContext } from './LayerHandle'
import {
  makeAddSMStateAutoInitCmd, makeAddSMTransitionCmd, makeSetInitialStateCmd,
} from '../../editor/commands-statemachine'
import { nextSMStateId, nextSMTransitionId } from '../../defaults'

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

  /** Add a state bound to a timeline. Returns the new state id. */
  addState(name: string, timelineId: string, opts?: { id?: string; speed?: number }): string {
    const stateId = opts?.id ?? nextSMStateId()
    const state: ChronoSMState = {
      id: stateId, name, timelineId,
      ...(opts?.speed != null ? { speed: opts.speed } : {}),
    }
    this.ctx.host.applyCommand(makeAddSMStateAutoInitCmd(this.id, state))
    return stateId
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
    this.ctx.host.applyCommand(makeAddSMTransitionCmd(this.id, transition))
    return this
  }

  /** Override which state the machine starts in. */
  setInitial(stateId: string): this {
    this.ctx.host.applyCommand(makeSetInitialStateCmd(this.id, stateId))
    return this
  }
}
