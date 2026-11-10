import type { KeyboardEvent } from 'react'

export type TreeDirection = 'up' | 'down' | 'parent' | 'child'

/** Common focus-based tree keys. Nested inputs/buttons retain native behavior;
 * tree navigation never selects implicitly. Enter/Space select (modifier adds),
 * Left/Right collapse/open before moving to parent/child. Handled events stop
 * before global viewport shortcuts. Virtualized panels own mounting/focus.
 */
export function handleLayerTreeKey(event: KeyboardEvent<HTMLElement>, options: {
  hasChildren: boolean; expanded: boolean; onSelect: (additive: boolean) => void
  onToggle?: () => void; onNavigate?: (direction: TreeDirection) => void
}): void {
  if (event.target !== event.currentTarget) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault(); event.stopPropagation()
    options.onSelect(event.shiftKey || event.metaKey || event.ctrlKey); return
  }
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault(); event.stopPropagation()
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') options.onNavigate?.(event.key === 'ArrowUp' ? 'up' : 'down')
  else if (event.key === 'ArrowLeft') {
    if (options.hasChildren && options.expanded) options.onToggle?.(); else options.onNavigate?.('parent')
  } else if (options.hasChildren) {
    if (!options.expanded) options.onToggle?.(); else options.onNavigate?.('child')
  }
}
