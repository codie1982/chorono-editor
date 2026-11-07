import type { ShortcutContext } from '../shortcuts/ShortcutDefinition'
import type { LayerType } from '../types'

export type EditorPanel = 'canvas' | 'timeline' | 'dopeSheet' | 'curveEditor' | 'resourceMonitor'

/** Portal menus have no panel ancestor: keep the panel that opened them. */
export function panelFromAttribute(panel: string | null | undefined, previous: EditorPanel): EditorPanel {
  if (panel == null) return previous
  if (panel === 'resourceMonitor') return panel
  return panel === 'timeline' || panel === 'dopeSheet' || panel === 'curveEditor' ? panel : 'canvas'
}

export function canvasOwnsPointDeletion(context: ShortcutContext, transactionActive: boolean): boolean {
  return context === 'canvas' && !transactionActive
}

/** Read-only resource inspection keeps global shortcuts without canvas/timeline tools. */
export function shortcutContextForPanel(panel: EditorPanel): ShortcutContext {
  if (panel === 'resourceMonitor') return 'global'
  return panel === 'canvas' ? 'canvas' : 'timeline'
}

/** Inspection is read-only; empty curve/dope selections never fall through to object deletion. */
export function deletionTargetForPanel(
  panel: EditorPanel,
  hasSelectedKeys: boolean,
  hasSelectedLayer: boolean,
  selectedLayerType?: LayerType,
): 'keyframes' | 'animation' | 'layer' | 'none' {
  if (panel === 'resourceMonitor') return 'none'
  if (panel !== 'canvas') {
    if (hasSelectedKeys) return 'keyframes'
    if (panel === 'timeline' && hasSelectedLayer && selectedLayerType === 'audio') return 'layer'
    return panel === 'timeline' && hasSelectedLayer ? 'animation' : 'none'
  }
  return hasSelectedLayer ? 'layer' : 'none'
}
