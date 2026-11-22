'use client'
import { useSplineTopologyActions } from './useSplineTopologyActions'
import { booleanOwner } from '@/lib/editor/boolean/operationPlan'
import { makePickBooleanCmd } from '@/lib/editor/boolean/pickOperation'

type Options = Omit<Parameters<typeof useSplineTopologyActions>[0], 'onSelectLayer'>

/** Adapt existing-layer picks from any editor surface to shared native Attach
 * or persisted Boolean actions, selected by the UI mode/current recipe.
 * action. Returns true while Add Spline owns the pick, including self, empty,
 * invalid or busy picks, so callers never replace the active target selection.
 * Each accepted source uses one guarded command/Undo. Attach focuses imported
 * IDs; Boolean keeps editable original inputs and their active target. No
 * gesture, derived geometry, history or persistent state is owned here. */
export function useSplineAttachPicking(options: Options): (sourceId: string | null) => boolean {
  const actions = useSplineTopologyActions(options)
  return sourceId => {
    const { controller, layer } = options
    if (!controller.active || !controller.attaching || !layer || controller.layerId !== layer.id) return false
    if (options.disabled || options.isTransactionActive?.()) {
      options.warning('Add Spline is unavailable during another edit or preview.')
      return true
    }
    if (!sourceId || sourceId === layer.id) return true
    if (options.getScene().layers.find(item => item.id === sourceId)?.type !== 'spline') {
      options.warning('Choose an existing spline object to add.')
    } else {
      const scene = options.getScene(), owner = booleanOwner(scene, layer.id)
      const operation = owner?.booleanOperation?.operation ?? controller.attachOperation
      if (operation === 'attach') actions.perform({ kind: 'attach', sourceId })
      else try {
        const command = makePickBooleanCmd(scene, layer.id, sourceId, operation, options.timeMs, options.overrides)
        if (command) options.dispatch(command)
        options.warning('')
      } catch (error) { options.warning(error instanceof Error ? error.message : String(error)) }
    }
    return true
  }
}
