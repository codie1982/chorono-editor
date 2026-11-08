/**
 * BL-53 — SceneExplorer context-menu builder
 *
 * Pure helper that returns a MenuItem[] for the row that was right-clicked.
 * Lives outside the component so it stays easy to test and modify in
 * isolation from the rendering code.
 *
 * Behaviour decisions:
 *   - When the right-clicked row IS part of the multi-selection, actions
 *     apply to the WHOLE selection (e.g. "Lock 3 layers"). When it's not,
 *     the click implicitly targets just that one layer (mirrors Finder /
 *     VS Code / Photoshop conventions).
 *   - "Mixed-state" toggles compute the target value as "if ANY off → all
 *     on, else all off". This is how After Effects + Figma handle bulk
 *     visibility / lock toggles.
 */

import type { Layer } from '@/lib/types'
import type { MenuItem } from '@/components/ui/ContextMenu'

// Same palette as TimelinePanel + LayerPanel so colour labels stay
// consistent across surfaces (BL-38 parity).
const COLOR_LABELS: { label: string; hex: string | null }[] = [
  { label: 'None',   hex: null      },
  { label: 'Blue',   hex: '#3B82F6' },
  { label: 'Cyan',   hex: '#06B6D4' },
  { label: 'Green',  hex: '#22C55E' },
  { label: 'Yellow', hex: '#EAB308' },
  { label: 'Orange', hex: '#F97316' },
  { label: 'Red',    hex: '#EF4444' },
  { label: 'Purple', hex: '#A855F7' },
  { label: 'Pink',   hex: '#EC4899' },
]

export interface SceneExplorerMenuHandlers {
  rename:        (id: string) => void
  duplicate:     (id: string) => void
  deleteLayers:  (ids: string[]) => void
  groupLayers:   (ids: string[]) => void
  ungroupGroup?: (id: string) => void
  setColorLabel: (ids: string[], color: string | null) => void
  bulkToggleFlag: (ids: string[], field: 'locked' | 'hidden' | 'solo' | 'pinned', nextValue: boolean) => void
  /** Hide all layers EXCEPT the targets (Isolate). */
  isolate?:      (ids: string[]) => void
  /** Clear hidden + solo flags on all layers (Show All). */
  showAll?:      () => void
  /** Panel-only tree state; never writes scene visibility. */
  expandSubtrees?: (ids:readonly string[]) => void
  collapseSubtrees?: (ids:readonly string[]) => void
  /** Explicit recursive visibility, delegated as one reversible editor command. */
  setSubtreeHidden?: (ids:readonly string[],hidden:boolean) => void
}

export interface BuildMenuOptions {
  /** The layer the user actually right-clicked on. */
  target: Layer
  /** Effective selection: target + any other selected rows. */
  selectionIds: string[]
  /** All layers (needed for mixed-state flag detection). */
  allLayers: Layer[]
  handlers: SceneExplorerMenuHandlers
}

export function buildSceneExplorerMenu(opts: BuildMenuOptions): MenuItem[] {
  const { target, selectionIds, allLayers, handlers } = opts
  const ids = selectionIds.length > 0 ? selectionIds : [target.id]
  const multi = ids.length > 1
  const selected = new Set(ids)
  const layers = allLayers.filter((l) => selected.has(l.id))

  // "ANY off → all on, else all off" — Figma / AE convention
  const computeNext = (field: 'locked' | 'hidden' | 'solo' | 'pinned'): boolean => {
    const anyOff = layers.some((l) => !l[field])
    return anyOff
  }

  const flagSubmenu = (field: 'locked' | 'hidden' | 'solo' | 'pinned', label: string): MenuItem => ({
    kind:  'action',
    label: multi ? `${label} (${ids.length})` : label,
    onSelect: () => handlers.bulkToggleFlag(ids, field, computeNext(field)),
  })

  const items: MenuItem[] = [
    {
      kind:     'action',
      label:    'Rename',
      shortcut: 'F2',
      disabled: multi,                       // rename only makes sense for one
      onSelect: () => handlers.rename(target.id),
    },
    {
      kind:     'action',
      label:    multi ? `Duplicate (${ids.length})` : 'Duplicate',
      shortcut: '⌘D',
      // Duplicating N layers is a small loop — page.tsx already handles it
      // for the multi-select case via duplicateSelectedLayer.
      onSelect: () => ids.forEach((id) => handlers.duplicate(id)),
    },
    {
      kind:     'action',
      label:    multi ? `Delete (${ids.length})` : 'Delete',
      shortcut: '⌫',
      onSelect: () => handlers.deleteLayers(ids),
    },

    { kind: 'separator' },

    // ── Visibility ───────────────────────────────────────────────────────
    flagSubmenu('hidden', 'Toggle Visibility'),
    flagSubmenu('locked', 'Toggle Lock'),
    flagSubmenu('solo',   'Toggle Solo'),
    flagSubmenu('pinned', 'Toggle Pin'),
  ]

  if (handlers.expandSubtrees || handlers.collapseSubtrees || handlers.setSubtreeHidden) items.push({
    kind: 'submenu', label: 'Subtree (selected + children)', items: [
      { kind: 'action', label: 'Expand subtree', disabled: !handlers.expandSubtrees, onSelect: () => handlers.expandSubtrees?.(ids) },
      { kind: 'action', label: 'Collapse subtree', disabled: !handlers.collapseSubtrees, onSelect: () => handlers.collapseSubtrees?.(ids) },
      { kind: 'action', label: 'Show subtree', disabled: !handlers.setSubtreeHidden, onSelect: () => handlers.setSubtreeHidden?.(ids, false) },
      { kind: 'action', label: 'Hide subtree', disabled: !handlers.setSubtreeHidden, onSelect: () => handlers.setSubtreeHidden?.(ids, true) },
    ],
  })

  // Isolate / Show All — only meaningful when the helpers are wired
  if (handlers.isolate || handlers.showAll) {
    items.push({ kind: 'separator' })
    if (handlers.isolate) {
      items.push({
        kind:     'action',
        label:    multi ? `Isolate (${ids.length})` : 'Isolate',
        onSelect: () => handlers.isolate!(ids),
      })
    }
    if (handlers.showAll) {
      items.push({
        kind:     'action',
        label:    'Show All',
        onSelect: () => handlers.showAll!(),
      })
    }
  }

  // ── Grouping ─────────────────────────────────────────────────────────────
  items.push({ kind: 'separator' })
  items.push({
    kind:     'action',
    label:    multi ? `Group (${ids.length})` : 'Wrap in Group',
    shortcut: '⌘G',
    disabled: ids.length < 1,
    onSelect: () => handlers.groupLayers(ids),
  })
  if (target.type === 'group' && handlers.ungroupGroup) {
    items.push({
      kind:     'action',
      label:    'Ungroup',
      shortcut: '⌘⇧G',
      onSelect: () => handlers.ungroupGroup!(target.id),
    })
  }

  // ── Color label submenu ─────────────────────────────────────────────────
  items.push({ kind: 'separator' })
  items.push({
    kind:  'submenu',
    label: 'Color Label',
    items: COLOR_LABELS.map((c) => ({
      kind:     'action' as const,
      label:    c.label,
      icon:     c.hex
        ? <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: c.hex }} />
        : <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, border: '1px dashed #555' }} />,
      onSelect: () => handlers.setColorLabel(ids, c.hex),
    })),
  })

  return items
}
