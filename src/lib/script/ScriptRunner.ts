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

export function runScript(
  code: string,
  host: ScriptHost,
  options: RunOptions = {},
): ScriptResult {
  const { onEvent, label = 'Script' } = options
  const logs: string[] = []
  const commands: EditorCommand[] = []

  // Working copy: starts at the real scene, advances as commands are produced.
  let working: ChronoScene = host.getScene()

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
    return { ok: false, logs, error: message, commandCount: commands.length }
  }

  // Commit everything as a single undo step.
  if (commands.length > 0) {
    host.applyCommand(makeBatchCmd(label, commands))
  }

  onEvent?.({ type: 'scriptComplete', commandCount: commands.length })
  return { ok: true, logs, commandCount: commands.length }
}
