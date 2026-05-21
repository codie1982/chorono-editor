// ── State Machine Actions (BL-09 AI surface) ──────────────────────────────────
// Thin AI wrapper over commands-statemachine.ts. The LLM supplies deterministic
// ids (like add_layer) so later tool calls can reference states/transitions.
//
// Build order the system prompt should follow:
//   create_timeline (one per state) → create_state_machine → add_sm_state ×N
//   → add_sm_transition ×M → set_initial_state
// The first add_sm_state auto-becomes the initial state, so set_initial_state is
// only needed to override that default.

import type {
  ChronoSMState, BaseSMTransition, StateMachineDefinition, SMGuard,
} from '@/lib/types'
import {
  makeAddStateMachineCmd, makeAddSMStateAutoInitCmd,
  makeAddSMTransitionCmd, makeSetInitialStateCmd,
} from '@/lib/editor/commands-statemachine'
import type { ActionRegistry } from '../ActionRegistry'

interface CreateSMParams { id: string; name?: string }
interface AddSMStateParams { smId: string; id: string; name: string; timelineId: string; speed?: number }
interface AddSMTransitionParams {
  smId: string; id?: string; from: string; to: string
  event?: string; blendMs?: number; priority?: number
  guardParam?: string; guardOp?: SMGuard['op']; guardValue?: number | string | boolean
}
interface SetInitialStateParams { smId: string; stateId: string }

const GUARD_OPS = ['>', '<', '==', '!=']

let smTransSeq = 0

export function registerStateMachineActions(reg: ActionRegistry): void {
  // ── create_state_machine ────────────────────────────────────────────────────
  reg.register<CreateSMParams>({
    id: 'sm.create',
    toolName: 'create_state_machine',
    description:
      'Create a state machine that switches between timelines based on events/guards. ' +
      'Create the per-state timelines FIRST, then this, then add_sm_state for each state. ' +
      'Use for interactive / multi-state scenarios (hover→active, idle→walk→run, 4 seasons…).',
    parameters: {
      type: 'object',
      required: ['id'],
      properties: {
        id:   { type: 'string', description: 'Unique state machine id e.g. "player_sm"' },
        name: { type: 'string', description: 'Display name shown in the SM editor' },
      },
    },
    toCommand: (p, scene) => {
      if (!p.id) return errorCmd('create_state_machine missing id')
      if ((scene.stateMachines ?? []).some((s) => s.id === p.id)) {
        return errorCmd(`state machine id "${p.id}" already exists`)
      }
      const sm: StateMachineDefinition = {
        id:             p.id,
        name:           p.name ?? p.id,
        initialStateId: '',
        states:         [],
        transitions:    [],
      }
      return makeAddStateMachineCmd(sm)
    },
  })

  // ── add_sm_state ──────────────────────────────────────────────────────────────
  reg.register<AddSMStateParams>({
    id: 'sm.addState',
    toolName: 'add_sm_state',
    description:
      'Add a state to a state machine. Each state plays one timeline while active. ' +
      'The first state added becomes the initial state automatically.',
    parameters: {
      type: 'object',
      required: ['smId', 'id', 'name', 'timelineId'],
      properties: {
        smId:       { type: 'string', description: 'State machine id' },
        id:         { type: 'string', description: 'Unique state id e.g. "idle"' },
        name:       { type: 'string', description: 'Display name' },
        timelineId: { type: 'string', description: 'Timeline that plays while this state is active' },
        speed:      { type: 'number', description: 'Playback rate multiplier (default 1)' },
      },
    },
    toCommand: (p, scene) => {
      if (!p.smId || !p.id || !p.name || !p.timelineId) {
        return errorCmd('add_sm_state missing smId / id / name / timelineId')
      }
      const sm = (scene.stateMachines ?? []).find((s) => s.id === p.smId)
      if (!sm) return errorCmd(`state machine "${p.smId}" not found`)
      if (sm.states.some((s) => s.id === p.id)) {
        return errorCmd(`state id "${p.id}" already exists in "${p.smId}"`)
      }
      if (!scene.timelines.some((t) => t.id === p.timelineId)) {
        return errorCmd(`timeline "${p.timelineId}" not found — create it before the state`)
      }
      const state: ChronoSMState = {
        id: p.id, name: p.name, timelineId: p.timelineId,
        ...(p.speed != null ? { speed: p.speed } : {}),
      }
      return makeAddSMStateAutoInitCmd(p.smId, state)
    },
  })

  // ── add_sm_transition ─────────────────────────────────────────────────────────
  reg.register<AddSMTransitionParams>({
    id: 'sm.addTransition',
    toolName: 'add_sm_transition',
    description:
      'Connect two states with a transition. Fires on `event`, when `guard` holds, or both. ' +
      'Use from="*" for a transition that applies from any state.',
    parameters: {
      type: 'object',
      required: ['smId', 'from', 'to'],
      properties: {
        smId:       { type: 'string', description: 'State machine id' },
        id:         { type: 'string', description: 'Optional transition id (auto-generated if omitted)' },
        from:       { type: 'string', description: 'Source state id, or "*" for any state' },
        to:         { type: 'string', description: 'Destination state id' },
        event:      { type: 'string', description: 'Event name that fires this transition' },
        blendMs:    { type: 'number', description: 'Cross-fade duration in ms (0 = hard cut)' },
        priority:   { type: 'number', description: 'Higher wins when multiple are eligible' },
        guardParam: { type: 'string', description: 'Parameter name for a guard condition' },
        guardOp:    { type: 'string', enum: GUARD_OPS, description: 'Guard comparison operator' },
        guardValue: { type: 'string', description: 'Guard comparison value (number/bool/string)' },
      },
    },
    toCommand: (p, scene) => {
      if (!p.smId || !p.from || !p.to) {
        return errorCmd('add_sm_transition missing smId / from / to')
      }
      const sm = (scene.stateMachines ?? []).find((s) => s.id === p.smId)
      if (!sm) return errorCmd(`state machine "${p.smId}" not found`)
      if (p.from !== '*' && !sm.states.some((s) => s.id === p.from)) {
        return errorCmd(`transition "from" state "${p.from}" not found`)
      }
      if (!sm.states.some((s) => s.id === p.to)) {
        return errorCmd(`transition "to" state "${p.to}" not found`)
      }
      if (!p.event && !p.guardParam) {
        return errorCmd('add_sm_transition needs an event and/or a guard (guardParam+guardOp+guardValue)')
      }
      let guard: SMGuard | undefined
      if (p.guardParam) {
        if (!p.guardOp || p.guardValue == null) {
          return errorCmd('guard requires guardParam, guardOp and guardValue together')
        }
        guard = { param: p.guardParam, op: p.guardOp, value: coerceGuardValue(p.guardValue) }
      }
      const transition: BaseSMTransition = {
        id: p.id ?? `smtrans_ai_${Date.now()}_${++smTransSeq}`,
        from: p.from, to: p.to,
        ...(p.event   != null ? { trigger:  p.event }   : {}),
        ...(guard               ? { guard }              : {}),
        ...(p.blendMs != null ? { blendMs:  p.blendMs }  : {}),
        ...(p.priority != null ? { priority: p.priority } : {}),
      }
      return makeAddSMTransitionCmd(p.smId, transition)
    },
  })

  // ── set_initial_state ─────────────────────────────────────────────────────────
  reg.register<SetInitialStateParams>({
    id: 'sm.setInitial',
    toolName: 'set_initial_state',
    description: 'Set which state a state machine starts in.',
    parameters: {
      type: 'object',
      required: ['smId', 'stateId'],
      properties: {
        smId:    { type: 'string', description: 'State machine id' },
        stateId: { type: 'string', description: 'State id to start in' },
      },
    },
    toCommand: (p, scene) => {
      if (!p.smId || !p.stateId) return errorCmd('set_initial_state missing smId / stateId')
      const sm = (scene.stateMachines ?? []).find((s) => s.id === p.smId)
      if (!sm) return errorCmd(`state machine "${p.smId}" not found`)
      if (!sm.states.some((s) => s.id === p.stateId)) {
        return errorCmd(`state "${p.stateId}" not found in "${p.smId}"`)
      }
      return makeSetInitialStateCmd(p.smId, p.stateId)
    },
  })
}

function coerceGuardValue(raw: number | string | boolean): number | string | boolean {
  if (typeof raw !== 'string') return raw
  if (raw === 'true') return true
  if (raw === 'false') return false
  const n = Number(raw)
  return Number.isFinite(n) && raw.trim() !== '' ? n : raw
}

function errorCmd(message: string) {
  return {
    label: `AI ERROR: ${message}`,
    execute: <S,>(s: S): S => s,
    undo:    <S,>(s: S): S => s,
  }
}
