import type { MenuItem } from '../ui/ContextMenu'
import type { SplineEditMode } from '@/lib/spline/selection'

export const SPLINE_EDIT_MODES = [
  { mode: 'point', label: 'Point' }, { mode: 'edge', label: 'Edge' }, { mode: 'object', label: 'Object' },
] as const

/** One shared Edit Mode submenu for viewport, Layers and Scene Explorer.
 * Callers admit a single spline target and own selection/context. Every entry
 * changes UI-only mode and reveals the same tools panel; no source command or
 * history mutation is created. Active is announced as text, not color alone. */
export function buildSplineEditModeMenu(options: {
  activeMode?: SplineEditMode
  onEnter(mode: SplineEditMode): void
  onDone?(): void
  onOpen?(): void
}): MenuItem {
  return { kind: 'submenu', label: 'Edit Mode', items: [
    ...SPLINE_EDIT_MODES.map(({ mode, label }) => ({ kind: 'action' as const, label,
      shortcut: options.activeMode === mode ? 'Active' : undefined,
      onSelect: () => { options.onEnter(mode); options.onOpen?.() } })),
    ...(options.onDone ? [{ kind: 'separator' as const }, { kind: 'action' as const, label: 'Layer mode',
      onSelect: () => { options.onDone!(); options.onOpen?.() } }] : []),
  ] }
}
