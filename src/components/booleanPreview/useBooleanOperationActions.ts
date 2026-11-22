'use client'
import type { ChronoScene } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { BooleanOperation } from '@/lib/geometry/boolean'
import { booleanOwner } from '@/lib/editor/boolean/operationPlan'
import { makeSetBooleanOperationCmd } from '@/lib/editor/boolean/pickOperation'
import { makeMergeBooleanPathsCmd, makeSeparateBooleanInputsCmd } from '@/lib/editor/boolean/operationCommands'

/** Shared native operation actions for Add Spline and Boolean Preview. Source
 * admission is read at activation, never from a rendered path; one command
 * owns each mode change/Merge/Separate. Host owns selection and diagnostics. */
export function useBooleanOperationActions(options: {
  layerId: string | null; getScene(): ChronoScene; dispatch(command: EditorCommand): void
  disabled?: boolean; isTransactionActive?(): boolean; onSelectLayer?(id: string): void; warning(message: string): void
}) {
  const owner = booleanOwner(options.getScene(), options.layerId)
  const run = (action: 'merge' | 'separate' | BooleanOperation): boolean => {
    try {
      const scene = options.getScene()
      if (!owner || booleanOwner(scene, options.layerId)?.id !== owner.id || options.disabled || options.isTransactionActive?.()) throw new Error('Select the current paused Boolean operation before editing it.')
      if (action === 'merge' || action === 'separate') {
        if (!options.onSelectLayer) throw new Error('This host cannot select the resulting geometry.')
        const plan = action === 'merge' ? makeMergeBooleanPathsCmd(scene, owner.id) : makeSeparateBooleanInputsCmd(scene, owner.id)
        options.dispatch(plan.command); options.onSelectLayer(plan.layerId)
      } else options.dispatch(makeSetBooleanOperationCmd(scene, owner.id, action))
      options.warning(''); return true
    } catch (error) { options.warning(error instanceof Error ? error.message : String(error)); return false }
  }
  return { owner, canFinish: !!options.onSelectLayer,
    primaryName: owner?.booleanOperation ? options.getScene().layers.find(layer => layer.id === owner.booleanOperation!.inputs[0].layerId)?.name : undefined,
    setOperation: (operation: BooleanOperation) => run(operation), merge: () => run('merge'), separate: () => run('separate') }
}
export type BooleanOperationActions = ReturnType<typeof useBooleanOperationActions>
