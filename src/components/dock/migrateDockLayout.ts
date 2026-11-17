import type { DockNode } from './types'
import { defaultLayout, findLeafOfPanel, removePanel, setActiveTab } from './layoutOps'

/** Retire the old Snap/Shortcuts dock entries without resetting a valid custom
 * layout. Existing removal collapses only emptied leaves; other panel IDs,
 * placement/ratios and closed panels are retained. UI preference only: no scene,
 * selection or history migration. Reapplying is identity-preserving. */
export function migrateDockLayout(tree: DockNode): DockNode {
  let result = tree
  for (const id of ['snap', 'shortcuts']) {
    const leaf = findLeafOfPanel(result, id)
    if (!leaf) continue
    const selected = leaf.panels[leaf.activeIndex]
    result = removePanel(result, id)
    const retained = selected !== id ? findLeafOfPanel(result, selected) : undefined
    if (retained) result = setActiveTab(result, retained.id, selected)
  }
  if (result !== tree && result.kind === 'leaf' && !result.panels.length) return defaultLayout()
  return result
}
