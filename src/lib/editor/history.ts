// ── Undo / Redo History ───────────────────────────────────────────────────────
// Pure functions — no React, no side effects.

import type { ChronoScene } from '../types'

const MAX_HISTORY = 50

export interface HistoryState {
  past: ChronoScene[]
  present: ChronoScene
  future: ChronoScene[]
}

/** Push the current present into past and set next as the new present. */
export function pushHistory(state: HistoryState, next: ChronoScene): HistoryState {
  return {
    past: [...state.past.slice(-(MAX_HISTORY - 1)), state.present],
    present: next,
    future: [],
  }
}

/** Move one step backward in history. No-op if already at the start. */
export function undoHistory(state: HistoryState): HistoryState {
  if (state.past.length === 0) return state
  const previous = state.past[state.past.length - 1]
  return {
    past:    state.past.slice(0, -1),
    present: previous,
    future:  [state.present, ...state.future],
  }
}

/** Move one step forward in history. No-op if already at the end. */
export function redoHistory(state: HistoryState): HistoryState {
  if (state.future.length === 0) return state
  const next = state.future[0]
  return {
    past:    [...state.past, state.present],
    present: next,
    future:  state.future.slice(1),
  }
}

/** Create an initial HistoryState from the starting scene. */
export function initHistory(scene: ChronoScene): HistoryState {
  return { past: [], present: scene, future: [] }
}
