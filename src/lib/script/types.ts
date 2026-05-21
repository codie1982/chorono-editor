// ── Authoring Script Types (BL-76) ────────────────────────────────────────────
// Editor-time scripting. JS host language + API facade over the existing command
// system. Does NOT require the playback runtime (ChronoPlayer).

import type { ChronoScene } from '../types'
import type { EditorCommand } from '../editor/commands-keyframe'

/**
 * Bridge the script engine to the editor. Provided by the React layer
 * (page.tsx) at execution time.
 */
export interface ScriptHost {
  /** Current scene — read by the API facade to resolve handles + prevLayer. */
  getScene(): ChronoScene
  /**
   * Apply a command. ScriptRunner collects these and commits them as ONE
   * batched undo step. The host's dispatch is called once with the batch.
   */
  applyCommand(cmd: EditorCommand): void
}

/** Event emitted by the ScriptRunner (honors the event-exposure convention). */
export type ScriptEventType = 'scriptStart' | 'scriptComplete' | 'scriptError'

export interface ScriptEvent {
  type: ScriptEventType
  /** Number of commands produced so far (complete) or 0 (start). */
  commandCount?: number
  /** Error message for 'scriptError'. */
  error?: string
}

/** Result of running a script. */
export interface ScriptResult {
  ok: boolean
  /** Lines collected via scene.log(). */
  logs: string[]
  /** Error message + (best-effort) stack, when ok === false. */
  error?: string
  /** How many commands the script produced (batched into one undo). */
  commandCount: number
}
