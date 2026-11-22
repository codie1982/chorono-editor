'use client'
import { useSplineTopologyActions } from './useSplineTopologyActions'

type Options = Omit<Parameters<typeof useSplineTopologyActions>[0], 'onSelectLayer'>

/** Adapt existing-layer picks from any editor surface to the same native Attach
 * action. Returns true while Add Spline owns the pick, including self, empty,
 * invalid or busy picks, so callers never replace the active target selection.
 * Each accepted source uses one guarded command/Undo and focuses imported IDs
 * after commit. No gesture, geometry, history or persistent state is owned here. */
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
    } else actions.perform({ kind: 'attach', sourceId })
    return true
  }
}
