'use client'
import { useSplineTopologyActions } from './useSplineTopologyActions'
import { booleanOwner } from '@/lib/editor/boolean/operationPlan'
import { materializeSplineBoolean } from '@/lib/editor/boolean/materializeSplineBoolean'
import { makePickBooleanCmd } from '@/lib/editor/boolean/pickOperation'

type Options = Parameters<typeof useSplineTopologyActions>[0]

/** Adapt existing-layer picks from any editor surface to shared native Attach
 * or persisted Boolean actions, selected by the UI mode/current recipe.
 * action. Returns true while Add Spline owns the pick, including self, empty,
 * invalid or busy picks, so callers never replace the active target selection.
 * Each accepted source uses one guarded command/Undo. Attach focuses imported
 * IDs; Boolean keeps editable original inputs and their active target. No
 * gesture, derived geometry, history or persistent state is owned here. */
export function useSplineAttachPicking(options: Options): (sourceId: string | null, objectId?: string) => boolean {
  const actions = useSplineTopologyActions(options)
  return (sourceId, objectId) => {
    const { controller, layer } = options
    if (!controller.active || !controller.attaching || !layer || controller.layerId !== layer.id) return false
    if (options.disabled || options.isTransactionActive?.()) {
      options.warning('Add Spline is unavailable during another edit or preview.')
      return true
    }
    if (!sourceId || sourceId === layer.id && !objectId) return true
    const scene = options.getScene(), owner = booleanOwner(scene, layer.id)
    const operation = owner?.booleanOperation?.operation ?? controller.attachOperation
    const source = scene.layers.find(item => item.id === sourceId)
    if (source?.type !== 'spline' && (operation === 'attach' || source?.type !== 'shape')) {
      options.warning(operation === 'attach' ? 'Choose an existing spline to attach.' : 'Choose a closed spline Object, spline or Basic Shape.')
    } else {
      if (operation === 'attach') { if (sourceId !== layer.id) actions.perform({ kind: 'attach', sourceId }) }
      else try {
        const command = makePickBooleanCmd(scene, layer.id, sourceId, operation, options.timeMs, options.overrides,
          { sourceObjectId: objectId, targetObjectIds: controller.bank.object })
        if (command && (controller.nonDestructive || owner)) options.dispatch(command)
        else if (command) {
          if (!options.onSelectLayer) throw new Error('This host cannot select the resulting spline.')
          const plan = materializeSplineBoolean(scene, command, layer.id, options.timeMs, options.overrides)
          options.dispatch(plan.command); options.onSelectLayer(plan.layerId)
          controller.focusResult({ layerId: plan.layerId, ids: plan.ids, ghosts: plan.ghosts, mode: 'object', operation, attaching: true })
        }
        options.warning('')
      } catch (error) { options.warning(error instanceof Error ? error.message : String(error)) }
    }
    return true
  }
}
