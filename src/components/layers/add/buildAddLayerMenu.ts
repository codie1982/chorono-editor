import { ADD_LAYER_GROUPS } from '@/lib/icons/iconMap'
import type { MenuItem } from '@/components/ui/ContextMenu'

/** Registry-backed Add submenu shared by object and empty-space context menus.
 * Borrows the same categories/availability as the Layers palette. Rendering
 * never activates a tool or writes source; native menu selection invokes the
 * owner synchronously so file pickers retain browser user activation.
 * An absent owner exposes no actions (e.g. a private content-detail host).
 */
export function buildAddLayerMenu(onAdd?: (kind: string) => void): MenuItem[] {
  if (!onAdd) return []
  const groups: MenuItem[] = ADD_LAYER_GROUPS.flatMap(group => {
    const items = group.items.filter(item => item.available)
    return items.length ? [{ kind: 'submenu' as const, label: group.title,
      items: items.map(item => ({ kind: 'action' as const, label: item.label, onSelect: () => onAdd(item.type) })) }] : []
  })
  return groups.length ? [{ kind: 'submenu', label: 'Add', items: groups }] : []
}
