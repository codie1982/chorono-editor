import type { Layer } from '@/lib/types'
import type { MenuItem } from '@/components/ui/ContextMenu'
import { detailUnavailableReason } from '@/lib/editor/detail'

/** Common entry semantics for Canvas, Layers and Explorer. Detail edits one
 * supported source; temporary isolation may cover the complete selection.
 * Missing handlers preserve legacy menus instead of advertising dead actions.
 */
export function itemDetailMenu(layer: Layer, count: number, onEdit?: () => void, onIsolate?: () => void): MenuItem[] {
  const items: MenuItem[] = []
  if (onEdit) {
    const reason = count > 1 ? 'Select one item to edit its content.' : detailUnavailableReason(layer)
    items.push({ kind: 'action', label: 'Edit content…', disabled: !!reason, disabledReason: reason ?? undefined, onSelect: onEdit })
  }
  if (onIsolate) items.push({ kind: 'action', label: 'Isolate selection', disabled: layer.type === 'audio', onSelect: onIsolate })
  if (items.length) items.push({ kind: 'separator' })
  return items
}
