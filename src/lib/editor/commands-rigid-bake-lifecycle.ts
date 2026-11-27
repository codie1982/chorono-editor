import { clearRigidBakeOwnedContent, type RigidBakeConflictPolicy } from '@/lib/physics/RigidBakeSceneMutation'
import type { ChronoScene } from '@/lib/types'
import type { EditorCommand } from './commands-keyframe'

/**
 * Clears one persisted rigid/fracture bake as a single undoable transaction.
 *
 * The safe default refuses edited, incomplete or legacy ownership. Callers may
 * pass `discard-edits` only after an explicit user choice. One undo restores
 * the exact tracks, layers, topology, record and timeline memberships.
 */
export function makeClearRigidBakeCmd(input: {
  readonly recordId: string
  readonly conflictPolicy?: RigidBakeConflictPolicy
}): EditorCommand {
  let before: ChronoScene | undefined
  return {
    label: `Clear Physics Bake (${input.recordId})`,
    execute(scene: ChronoScene): ChronoScene {
      before = scene
      return clearRigidBakeOwnedContent(scene, input.recordId, input.conflictPolicy)
    },
    undo(scene: ChronoScene): ChronoScene {
      return before ?? scene
    },
  }
}
