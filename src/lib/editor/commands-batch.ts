// ── BatchCommand ──────────────────────────────────────────────────────────────
//
// Composes N EditorCommands into one atomic undo step.
//
// Use cases:
//   - SVG Import: 50 path layers added → 1 undo step
//   - Group / Ungroup: parent re-assignment + group create/delete
//   - Move-to-group: layer's parentId change + reorder
//   - Stagger preset application across multiple layers
//
// Semantics:
//   execute() applies commands in array order
//   undo()    reverses commands in REVERSE order (last-applied is first-undone)
//
// This matches the natural mental model: do A, then B → undo B first, then A.

import type { ChronoScene } from '../types'
import type { EditorCommand } from './commands-keyframe'

export function makeBatchCmd(label: string, commands: EditorCommand[]): EditorCommand {
  // Filter empty for safety — calling .reduce on [] would no-op cleanly anyway,
  // but explicit handling makes the contract clearer.
  if (commands.length === 0) {
    return {
      label,
      execute: (scene) => scene,
      undo:    (scene) => scene,
    }
  }

  return {
    label,
    execute(scene: ChronoScene): ChronoScene {
      return commands.reduce((s, cmd) => cmd.execute(s), scene)
    },
    undo(scene: ChronoScene): ChronoScene {
      // Reverse order: last-applied is first to undo
      let s = scene
      for (let i = commands.length - 1; i >= 0; i--) {
        s = commands[i].undo(s)
      }
      return s
    },
  }
}
