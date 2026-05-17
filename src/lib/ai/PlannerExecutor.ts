// ── PlannerExecutor ───────────────────────────────────────────────────────────
// Converts AI tool calls into EditorCommands.
//
// Walks the toolCalls list in order, looking up each ActionDef in the
// registry and building a command. Working scene is advanced after each
// command so sequential dependencies (create_timeline → add_keyframes)
// work without coupling between actions.

import type { ChronoScene } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { AIToolCall } from './types'
import { actionRegistry } from './ActionRegistry'

export interface ExecutionResult {
  commands: EditorCommand[]
  appliedLabels: string[]
  errors: string[]
}

export function buildCommandsFromToolCalls(
  toolCalls: AIToolCall[],
  scene: ChronoScene,
): ExecutionResult {
  const commands: EditorCommand[] = []
  const appliedLabels: string[] = []
  const errors: string[] = []
  let workingScene = scene

  for (const call of toolCalls) {
    const def = actionRegistry.get(call.name)
    if (!def) {
      errors.push(`Unknown tool: "${call.name}"`)
      continue
    }
    try {
      const cmd = def.toCommand(
        call.input as Record<string, unknown>,
        workingScene,
      )
      if (!cmd) continue
      commands.push(cmd)
      appliedLabels.push(cmd.label)
      // Surface action-level errors (label-prefixed "AI ERROR")
      if (cmd.label.startsWith('AI ERROR')) {
        errors.push(cmd.label.replace(/^AI ERROR:\s*/, ''))
      }
      // Advance working scene — next command sees post-execute state
      workingScene = cmd.execute(workingScene)
    } catch (err: unknown) {
      errors.push(`Tool "${call.name}" failed: ${(err as Error).message}`)
    }
  }

  return { commands, appliedLabels, errors }
}
