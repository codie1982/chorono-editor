// ── State Machine Commands (BL-09) ──────────────────────────────────────────
// Factory functions returning undoable EditorCommands that mutate
// `scene.stateMachines`. Each carries execute() + undo() for the history stack.

import type {
  ChronoScene, Timeline,
  StateMachineDefinition, ChronoSMState, BaseSMTransition,
} from '../types'
import type { EditorCommand } from './commands-keyframe'
import { newTimeline, newStateMachine } from '../defaults'

// ── Internal helpers ────────────────────────────────────────────────────────

/** Map over a single state machine by id, leaving the rest untouched. */
function mapSM(
  scene: ChronoScene,
  smId: string,
  fn: (sm: StateMachineDefinition) => StateMachineDefinition,
): ChronoScene {
  const list = scene.stateMachines ?? []
  return {
    ...scene,
    stateMachines: list.map((sm) => (sm.id === smId ? fn(sm) : sm)),
  }
}

// ── Create / delete machine ─────────────────────────────────────────────────

/**
 * Create a new state machine plus an empty timeline for its initial "idle"
 * state. Both are added together so the SM is never left dangling without a
 * backing timeline.
 */
export function makeCreateSMCmd(name?: string): EditorCommand {
  const timeline: Timeline = newTimeline()
  const sm: StateMachineDefinition = newStateMachine(timeline.id, name)
  return {
    label: 'Create State Machine',
    execute: (scene) => ({
      ...scene,
      timelines: [...scene.timelines, timeline],
      stateMachines: [...(scene.stateMachines ?? []), sm],
    }),
    undo: (scene) => ({
      ...scene,
      timelines: scene.timelines.filter((t) => t.id !== timeline.id),
      stateMachines: (scene.stateMachines ?? []).filter((s) => s.id !== sm.id),
    }),
  }
}

/**
 * Add a fully-formed state machine (caller controls id / states / transitions).
 * Used by the AI tool + script builder, which assign deterministic ids and wire
 * states to pre-existing timelines — unlike makeCreateSMCmd, this neither
 * generates an idle state nor a backing timeline.
 */
export function makeAddStateMachineCmd(sm: StateMachineDefinition): EditorCommand {
  return {
    label: 'Add State Machine',
    execute: (scene) => ({
      ...scene,
      stateMachines: [...(scene.stateMachines ?? []), sm],
    }),
    undo: (scene) => ({
      ...scene,
      stateMachines: (scene.stateMachines ?? []).filter((s) => s.id !== sm.id),
    }),
  }
}

export function makeDeleteSMCmd(sm: StateMachineDefinition): EditorCommand {
  return {
    label: 'Delete State Machine',
    execute: (scene) => ({
      ...scene,
      stateMachines: (scene.stateMachines ?? []).filter((s) => s.id !== sm.id),
    }),
    undo: (scene) => ({
      ...scene,
      stateMachines: [...(scene.stateMachines ?? []), sm],
    }),
  }
}

// ── States ──────────────────────────────────────────────────────────────────

export function makeAddSMStateCmd(smId: string, state: ChronoSMState): EditorCommand {
  return {
    label: `Add State: ${state.name}`,
    execute: (scene) => mapSM(scene, smId, (sm) => ({ ...sm, states: [...sm.states, state] })),
    undo:    (scene) => mapSM(scene, smId, (sm) => ({ ...sm, states: sm.states.filter((s) => s.id !== state.id) })),
  }
}

/**
 * Add a state and, when the machine has no valid initial state yet, make this
 * the initial one. Used by the AI tool + script builder so an incrementally
 * built machine is runnable from the first state without an explicit
 * set-initial call.
 */
export function makeAddSMStateAutoInitCmd(smId: string, state: ChronoSMState): EditorCommand {
  return {
    label: `Add State: ${state.name}`,
    execute: (scene) => mapSM(scene, smId, (sm) => {
      const hasValidInitial = !!sm.initialStateId && sm.states.some((s) => s.id === sm.initialStateId)
      return {
        ...sm,
        states: [...sm.states, state],
        initialStateId: hasValidInitial ? sm.initialStateId : state.id,
      }
    }),
    undo: (scene) => mapSM(scene, smId, (sm) => ({
      ...sm,
      states: sm.states.filter((s) => s.id !== state.id),
      initialStateId: sm.initialStateId === state.id ? '' : sm.initialStateId,
    })),
  }
}

/**
 * Delete a state. Any transitions referencing it (from/to) are removed too so
 * the graph stays consistent; undo restores the state and those edges. The
 * removed transitions are captured at execute time so undo is exact.
 */
export function makeDeleteSMStateCmd(smId: string, stateId: string): EditorCommand {
  let removedState: ChronoSMState | undefined
  let removedTransitions: BaseSMTransition[] = []
  return {
    label: 'Delete State',
    execute: (scene) =>
      mapSM(scene, smId, (sm) => {
        removedState = sm.states.find((s) => s.id === stateId)
        removedTransitions = sm.transitions.filter((t) => t.from === stateId || t.to === stateId)
        return {
          ...sm,
          states: sm.states.filter((s) => s.id !== stateId),
          transitions: sm.transitions.filter((t) => t.from !== stateId && t.to !== stateId),
        }
      }),
    undo: (scene) =>
      mapSM(scene, smId, (sm) => ({
        ...sm,
        states: removedState ? [...sm.states, removedState] : sm.states,
        transitions: [...sm.transitions, ...removedTransitions],
      })),
  }
}

/**
 * Patch fields on a state. Previous values of the patched keys are captured at
 * execute time so undo restores exactly what changed.
 */
export function makeUpdateSMStateCmd(
  smId: string,
  stateId: string,
  patch: Partial<Omit<ChronoSMState, 'id'>>,
): EditorCommand {
  let prev: Partial<ChronoSMState> = {}
  return {
    label: 'Update State',
    execute: (scene) =>
      mapSM(scene, smId, (sm) => ({
        ...sm,
        states: sm.states.map((s) => {
          if (s.id !== stateId) return s
          // Capture only the keys we're about to overwrite.
          const captured: Partial<ChronoSMState> = {}
          for (const k of Object.keys(patch) as (keyof ChronoSMState)[]) {
            ;(captured as Record<string, unknown>)[k] = s[k]
          }
          prev = captured
          return { ...s, ...patch }
        }),
      })),
    undo: (scene) =>
      mapSM(scene, smId, (sm) => ({
        ...sm,
        states: sm.states.map((s) => (s.id !== stateId ? s : { ...s, ...prev })),
      })),
  }
}

// ── Transitions ───────────────────────────────────────────────────────────────

export function makeAddSMTransitionCmd(smId: string, transition: BaseSMTransition): EditorCommand {
  return {
    label: 'Add Transition',
    execute: (scene) => mapSM(scene, smId, (sm) => ({ ...sm, transitions: [...sm.transitions, transition] })),
    undo:    (scene) => mapSM(scene, smId, (sm) => ({ ...sm, transitions: sm.transitions.filter((t) => t.id !== transition.id) })),
  }
}

export function makeDeleteSMTransitionCmd(smId: string, transitionId: string): EditorCommand {
  let removed: BaseSMTransition | undefined
  return {
    label: 'Delete Transition',
    execute: (scene) =>
      mapSM(scene, smId, (sm) => {
        removed = sm.transitions.find((t) => t.id === transitionId)
        return { ...sm, transitions: sm.transitions.filter((t) => t.id !== transitionId) }
      }),
    undo: (scene) =>
      mapSM(scene, smId, (sm) => ({
        ...sm,
        transitions: removed ? [...sm.transitions, removed] : sm.transitions,
      })),
  }
}

/**
 * Patch fields on a transition (trigger / guard / blendMs / priority / from /
 * to). Previous values of the patched keys are captured at execute time so undo
 * restores exactly what changed. Set a key to `undefined` in the patch to clear
 * it (e.g. removing a guard) — undo still restores the prior value.
 */
export function makeUpdateSMTransitionCmd(
  smId: string,
  transitionId: string,
  patch: Partial<Omit<BaseSMTransition, 'id'>>,
): EditorCommand {
  let prev: Partial<BaseSMTransition> = {}
  return {
    label: 'Update Transition',
    execute: (scene) =>
      mapSM(scene, smId, (sm) => ({
        ...sm,
        transitions: sm.transitions.map((t) => {
          if (t.id !== transitionId) return t
          const captured: Partial<BaseSMTransition> = {}
          for (const k of Object.keys(patch) as (keyof BaseSMTransition)[]) {
            ;(captured as Record<string, unknown>)[k] = t[k]
          }
          prev = captured
          return { ...t, ...patch }
        }),
      })),
    undo: (scene) =>
      mapSM(scene, smId, (sm) => ({
        ...sm,
        transitions: sm.transitions.map((t) => (t.id !== transitionId ? t : { ...t, ...prev })),
      })),
  }
}

// ── Initial state ─────────────────────────────────────────────────────────────

export function makeSetInitialStateCmd(smId: string, stateId: string): EditorCommand {
  let prevInitial: string | undefined
  return {
    label: 'Set Initial State',
    execute: (scene) =>
      mapSM(scene, smId, (sm) => {
        prevInitial = sm.initialStateId
        return { ...sm, initialStateId: stateId }
      }),
    undo: (scene) =>
      mapSM(scene, smId, (sm) =>
        prevInitial === undefined ? sm : { ...sm, initialStateId: prevInitial }
      ),
  }
}
