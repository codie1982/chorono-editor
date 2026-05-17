/**
 * BL-52 — Scene Explorer column definitions
 *
 * Declarative column system. Each column knows its width, header label, and
 * which cell renderer key to dispatch to. Visibility + ordering are owned by
 * the panel state (default order baked in here, persisted by user later in
 * BL-53).
 *
 * Cell rendering is keyed (instead of inline) so columns serialize cleanly
 * (localStorage in BL-53 / column presets in BL-58) without function refs.
 */

import type { Layer } from '@/lib/types'

/** Stable identifier for the cell renderer dispatched by SceneExplorerCell. */
export type CellKind =
  | 'name'      // disclosure + icon + editable label
  | 'visible'   // 👁 toggle
  | 'locked'    // 🔒 toggle
  | 'solo'      // ☆ toggle
  | 'pinned'    // 📌 toggle
  | 'type'      // text — layer kind
  | 'color'     // small color swatch (layer.colorLabel)
  | 'startMs'   // number (ms)
  | 'endMs'     // number (ms)
  | 'tracks'    // animated-property count (read-only badge)

export interface ColumnDefinition {
  id: string
  /** Header text rendered in the column header row. Short. */
  label: string
  /** Long-form tooltip shown on hover. */
  title?: string
  /** Fixed CSS width (px). 'flex' columns (the name column) take rest. */
  width: number | 'flex'
  /** Sticky-left? (true for name; everything else scrolls horizontally). */
  sticky?: boolean
  /** Cell kind dispatched to <SceneExplorerCell />. */
  kind: CellKind
  /** Default: visible on first render. Users can toggle later (BL-53). */
  defaultVisible: boolean
  /** Sort accessor (BL-53). undefined ⇒ column is not sortable. */
  sortKey?: (layer: Layer) => number | string | boolean
}

// ── Default columns ──────────────────────────────────────────────────────
// Order = visual left-to-right order. `name` is sticky so it stays anchored
// while wide right-side columns scroll horizontally on narrow panels.

export const DEFAULT_COLUMNS: ColumnDefinition[] = [
  {
    id: 'name',
    label: 'Name',
    width: 'flex',
    sticky: true,
    kind: 'name',
    defaultVisible: true,
    sortKey: (l) => l.name.toLowerCase(),
  },
  {
    id: 'visible',
    label: 'V',
    title: 'Visible (hidden layers are dimmed)',
    width: 28,
    kind: 'visible',
    defaultVisible: true,
    sortKey: (l) => l.hidden ? 1 : 0,
  },
  {
    id: 'locked',
    label: 'L',
    title: 'Locked (prevents editing)',
    width: 28,
    kind: 'locked',
    defaultVisible: true,
    sortKey: (l) => l.locked ? 1 : 0,
  },
  {
    id: 'solo',
    label: 'S',
    title: 'Solo (hide everything else)',
    width: 28,
    kind: 'solo',
    defaultVisible: true,
    sortKey: (l) => l.solo ? 1 : 0,
  },
  {
    id: 'pinned',
    label: 'P',
    title: 'Pinned (stick to top of explorer + timeline)',
    width: 28,
    kind: 'pinned',
    defaultVisible: true,
    sortKey: (l) => l.pinned ? 1 : 0,
  },
  {
    id: 'type',
    label: 'Type',
    title: 'Layer kind',
    width: 80,
    kind: 'type',
    defaultVisible: true,
    sortKey: (l) => l.type,
  },
  {
    id: 'color',
    label: 'Color',
    title: 'Color label',
    width: 50,
    kind: 'color',
    defaultVisible: true,
  },
  {
    id: 'startMs',
    label: 'Start',
    title: 'Timeline range — start (ms)',
    width: 64,
    kind: 'startMs',
    defaultVisible: false,
    sortKey: (l) => l.startMs ?? 0,
  },
  {
    id: 'endMs',
    label: 'End',
    title: 'Timeline range — end (ms)',
    width: 64,
    kind: 'endMs',
    defaultVisible: false,
    sortKey: (l) => l.endMs ?? Number.MAX_SAFE_INTEGER,
  },
  {
    id: 'tracks',
    label: 'Anim',
    title: 'Number of animated property tracks',
    width: 48,
    kind: 'tracks',
    defaultVisible: false,
  },
]

/** Convenience: filter to currently-visible columns preserving order. */
export function getVisibleColumns(
  all: ColumnDefinition[],
  visibleIds: Set<string>,
): ColumnDefinition[] {
  return all.filter((c) => visibleIds.has(c.id))
}

/** Default visibility set derived from defaultVisible flags. */
export function defaultVisibleColumnIds(all: ColumnDefinition[] = DEFAULT_COLUMNS): Set<string> {
  return new Set(all.filter((c) => c.defaultVisible).map((c) => c.id))
}
