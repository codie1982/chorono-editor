'use client'
import type { ChronoScene } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { BooleanOperation } from '@/lib/geometry/boolean'
import { booleanOwner } from '@/lib/editor/boolean/operationPlan'
import { makeSelectedSplineBooleanCmd, makeSetBooleanOperationCmd } from '@/lib/editor/boolean/pickOperation'
import { materializeSplineBoolean } from '@/lib/editor/boolean/materializeSplineBoolean'
import type { SplineEditRequest } from '@/components/splineEdit/useSplineEditSelection'
import type { OverrideMap } from '@/lib/evaluator'
import { makeSeparateBooleanInputsCmd } from '@/lib/editor/boolean/operationCommands'

/** Shared native operation actions for Add Spline and Boolean Preview. Source
 * admission is read at activation, never from a rendered path; one command
 * owns each mode change/Merge/Separate. Host owns selection and diagnostics. */
export function useBooleanOperationActions(options: {
  layerId: string | null; getScene(): ChronoScene; dispatch(command: EditorCommand): void
  disabled?: boolean; isTransactionActive?(): boolean; onSelectLayer?(id: string): void; warning(message: string): void
  nonDestructive?: boolean
  onMaterialized?(request: SplineEditRequest): void
  selectedObjectIds?(): readonly string[]; timeMs?: number; overrides?: OverrideMap
}) {
  const owner = booleanOwner(options.getScene(), options.layerId)
  const run = (action: 'merge' | 'separate' | BooleanOperation): boolean => {
    try {
      const scene = options.getScene()
      if (!owner || booleanOwner(scene, options.layerId)?.id !== owner.id || options.disabled || options.isTransactionActive?.()) throw new Error('Select the current paused Boolean operation before editing it.')
      if (action === 'merge' || action === 'separate') {
        if (!options.onSelectLayer) throw new Error('This host cannot select the resulting geometry.')
        if (action === 'merge') {
          const plan = materializeSplineBoolean(scene, null, owner.id, options.timeMs, options.overrides)
          options.dispatch(plan.command); options.onSelectLayer(plan.layerId)
          options.onMaterialized?.({ layerId: plan.layerId, ids: plan.ids, ghosts: plan.ghosts, mode: 'object' })
        } else {
          const plan = makeSeparateBooleanInputsCmd(scene, owner.id)
          options.dispatch(plan.command); options.onSelectLayer(plan.layerId)
        }
      } else options.dispatch(makeSetBooleanOperationCmd(scene, owner.id, action))
      options.warning(''); return true
    } catch (error) { options.warning(error instanceof Error ? error.message : String(error)); return false }
  }
  /** Operation buttons act on the current Object bank immediately, or only
   * choose a future pick policy when fewer than two Objects are selected. */
  const applyObjects = (operation: BooleanOperation): boolean => {
    try {
      if (!options.layerId || options.disabled || options.isTransactionActive?.()) throw new Error('Finish the current edit before applying a spline operation.')
      const scene = options.getScene()
      if (!options.onSelectLayer) throw new Error('This host cannot select the resulting spline.')
      const currentOwner = booleanOwner(scene, options.layerId)
      const command = currentOwner ? makeSetBooleanOperationCmd(scene, currentOwner.id, operation)
        : makeSelectedSplineBooleanCmd(scene, options.layerId, options.selectedObjectIds?.() ?? [], operation, options.timeMs, options.overrides)
      if (command && (options.nonDestructive || currentOwner)) options.dispatch(command)
      else if (command) {
        const plan = materializeSplineBoolean(scene, command, options.layerId, options.timeMs, options.overrides)
        options.dispatch(plan.command); options.onSelectLayer(plan.layerId)
        options.onMaterialized?.({ layerId: plan.layerId, ids: plan.ids, ghosts: plan.ghosts, mode: 'object', operation })
      }
      options.warning(''); return true
    } catch (error) { options.warning(error instanceof Error ? error.message : String(error)); return false }
  }
  return { owner, canFinish: !!options.onSelectLayer, applyObjects,
    primaryName: owner?.booleanOperation ? options.getScene().layers.find(layer => layer.id === owner.booleanOperation!.inputs[0].layerId)?.name : undefined,
    setOperation: (operation: BooleanOperation) => run(operation), merge: () => run('merge'), separate: () => run('separate') }
}
export type BooleanOperationActions = ReturnType<typeof useBooleanOperationActions>
