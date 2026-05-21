// ── ScriptRunner (BL-76) ──────────────────────────────────────────────────────
// Executes an authoring script (JS host language) against the editor.
//
// Strategy:
//   1. Snapshot the current scene as a WORKING copy.
//   2. Each API call produces a command; we collect it AND apply it to the
//      working copy so subsequent reads inside the script are consistent.
//   3. After the script finishes, all commands are committed as ONE batch
//      (single undo step) via the real host.
//
// Event-exposure convention (see arch_scripting_event_system memo): the runner
// emits scriptStart / scriptComplete / scriptError so the Console / host can
// observe script execution.

import type { ChronoScene } from '../types'
import type { EditorCommand } from '../editor/commands-keyframe'
import { makeBatchCmd } from '../editor/commands-batch'
import { createSceneAPI } from './api/SceneAPI'
import type { ScriptHost, ScriptResult, ScriptEvent } from './types'

export interface RunOptions {
  /** Event sink — honors the event-exposure convention. */
  onEvent?: (event: ScriptEvent) => void
  /** Label shown in undo history. Default 'Script'. */
  label?: string
}

/**
 * Shared core: run the script against a working copy of `initialScene`,
 * collecting commands WITHOUT committing them. Both runScript (dispatches) and
 * compileScript (returns a command) build on this.
 */
function executeScript(
  code: string,
  initialScene: ChronoScene,
  onEvent?: (event: ScriptEvent) => void,
): { result: ScriptResult; commands: EditorCommand[] } {
  const logs: string[] = []
  const commands: EditorCommand[] = []

  // Working copy: starts at the given scene, advances as commands are produced
  // so script reads (e.g. handle.opacity after a set) stay consistent.
  let working: ChronoScene = initialScene

  const innerHost: ScriptHost = {
    getScene: () => working,
    applyCommand: (cmd: EditorCommand) => {
      commands.push(cmd)
      working = cmd.execute(working)
    },
  }

  const api = createSceneAPI(innerHost, (line) => logs.push(line))

  onEvent?.({ type: 'scriptStart', commandCount: 0 })

  try {
    // JS host: the script body runs with `scene` injected. Not a sandbox —
    // acceptable for a local authoring tool (S4 adds quickjs isolation).
    // eslint-disable-next-line no-new-func
    const fn = new Function('scene', `"use strict";\n${code}`)
    fn(api)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    onEvent?.({ type: 'scriptError', error: message, commandCount: commands.length })
    // On error, discard collected commands — nothing is committed.
    return {
      result: { ok: false, logs, error: message, commandCount: commands.length },
      commands: [],
    }
  }

  onEvent?.({ type: 'scriptComplete', commandCount: commands.length })
  return {
    result: { ok: true, logs, commandCount: commands.length },
    commands,
  }
}

/**
 * Run a script and DISPATCH the result as one batched undo step.
 * Used by the REPL panel (ScriptConsolePanel).
 */
export function runScript(
  code: string,
  host: ScriptHost,
  options: RunOptions = {},
): ScriptResult {
  const { onEvent, label = 'Script' } = options
  const { result, commands } = executeScript(code, host.getScene(), onEvent)

  if (result.ok && commands.length > 0) {
    host.applyCommand(makeBatchCmd(label, commands))
  }
  return result
}

/**
 * Compile a script into ONE batched EditorCommand WITHOUT dispatching.
 * Used by the AI run_script ActionDef so the planner executor can dispatch it
 * through the normal pipeline (shares the same SceneAPI core as the REPL).
 *
 * Returns command=null when the script errors or produces no commands.
 */
export function compileScript(
  code: string,
  scene: ChronoScene,
  options: RunOptions = {},
): { result: ScriptResult; command: EditorCommand | null } {
  const { onEvent, label = 'AI Script' } = options
  const { result, commands } = executeScript(code, scene, onEvent)

  const command =
    result.ok && commands.length > 0 ? makeBatchCmd(label, commands) : null
  return { result, command }
}
