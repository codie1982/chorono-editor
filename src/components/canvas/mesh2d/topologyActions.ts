import type { ChronoScene, Layer } from '@/lib/types'
import { makeMeshTopologyCmd } from '@/lib/editor/modifiers/commands'
import type { MeshToolKind } from '@/lib/geometry/mesh2d/edit/topologyEdit'
import { uid } from '@/lib/spline/util/uid'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { MenuActionItem } from '@/components/ui/ContextMenu'
import type { MeshSelectionSummary } from './meshEditSelection'

const tools: readonly [MeshToolKind, string, 'face' | 'edge'][] = [
  ['deleteFace', 'Delete Face', 'face'],
  ['splitEdge', 'Split Edge', 'edge'],
  ['flipEdge', 'Flip Edge', 'edge'],
  ['fill', 'Fill', 'edge'],
]

/** Menu and panel share selection admission and prepare the same native
 * command. A fresh scene read on activation protects against stale previews. */
export function meshTopologyActions(
  layer: Layer,
  selection: Pick<MeshSelectionSummary, 'mode' | 'ids' | 'modifierId' | 'topologyHash'>,
  getScene: () => ChronoScene,
  dispatch: (cmd: EditorCommand) => void,
  warning: (message: string) => void,
  t = 0.5,
): MenuActionItem[] {
  const ids = selection.ids ?? []
  return tools
    .filter(([, , mode]) => mode === selection.mode)
    .map(([kind, label]) => {
      const scene = getScene()
      const build = (source: ChronoScene) => {
        if (!selection.modifierId || !selection.topologyHash || !ids.length)
          throw new Error('Select mesh components first.')
        if ((kind === 'splitEdge' || kind === 'flipEdge') && ids.length !== 1) throw new Error('Select one edge.')
        if (kind === 'fill' && ids.length < 3) throw new Error('Select the complete boundary of a hole.')
        return makeMeshTopologyCmd(source, layer.id, selection.modifierId, {
          kind,
          ids,
          topologyHash: selection.topologyHash,
          ...(kind === 'splitEdge' ? { t, vertexId: uid('mesh-vertex') } : {}),
        })
      }
      let reason: string | undefined
      let prepared: EditorCommand | undefined
      try {
        prepared = build(scene)
      } catch (error) {
        reason = error instanceof Error ? error.message : String(error)
      }
      return {
        kind: 'action',
        label,
        disabled: !!reason,
        disabledReason: reason,
        onSelect: () => {
          try {
            const current = getScene()
            dispatch(prepared && current === scene ? prepared : build(current))
            warning('')
          } catch (error) {
            warning(error instanceof Error ? error.message : String(error))
          }
        },
      }
    })
}
