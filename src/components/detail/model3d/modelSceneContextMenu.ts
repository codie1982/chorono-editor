import type { MenuItem } from '@/components/ui/ContextMenu'
import type { ModelTreeVisibility } from '@/lib/model3d/inspection/modelSceneTree'

export interface ModelSceneMenuOptions {
  selectionCount: number; selectableCount: number; removableCount: number
  isolationActive: boolean; sourceDisabled: boolean; visibility?: ModelTreeVisibility
  onSelectAll(): void; onClearSelection(): void; onToggleIsolation(): void; onDelete(): void
  /** Provided only for a concrete object row in Scene Explorer. */
  onRename?(): void
  /** Edit eligibility is evaluated against the menu's captured selection. */
  editModeReason?: string
  editing?: boolean
  onEditMode?(): void
  onToggleFlag(flag: 'visible' | 'frozen' | 'renderable', value: boolean): void
}

/** Shared 3D object menu for viewport and Explorer. Labels describe the
 * effective selection captured when the menu opens; source actions are disabled
 * when the draft is stale or a selected imported node is not removable. */
export function buildModelSceneContextMenu(options: ModelSceneMenuOptions): MenuItem[] {
  const { selectionCount, selectableCount, removableCount, isolationActive, sourceDisabled, visibility } = options
  const items: MenuItem[] = [
    ...(options.onRename ? [{ kind: 'action' as const, label: 'Rename', disabled: sourceDisabled, onSelect: options.onRename }, { kind: 'separator' as const }] : []),
    { kind: 'action', label: options.editing ? 'Exit Edit Mode' : 'Edit Mode', disabled: !options.onEditMode || !options.editing && !!options.editModeReason,
      disabledReason: !options.onEditMode ? 'Edit Mode is unavailable here.' : options.editing ? undefined : options.editModeReason,
      onSelect: () => options.onEditMode?.() },
    { kind: 'separator' },
    { kind: 'action', label: 'Select all scene objects', shortcut: '⌘A', disabled: selectableCount === 0, onSelect: options.onSelectAll },
    { kind: 'action', label: 'Clear selection', disabled: selectionCount === 0, onSelect: options.onClearSelection },
    { kind: 'action', label: isolationActive ? 'Exit isolation' : 'Isolate selection', disabled: !isolationActive && selectionCount === 0, onSelect: options.onToggleIsolation },
  ]
  if (visibility && selectionCount <= 1) items.push(
    { kind: 'separator' },
    { kind: 'action', label: visibility.visible ? 'Hide in viewport' : 'Show in viewport', disabled: sourceDisabled,
      onSelect: () => options.onToggleFlag('visible', !visibility.visible) },
    { kind: 'action', label: visibility.frozen ? 'Unfreeze object' : 'Freeze object', disabled: sourceDisabled,
      onSelect: () => options.onToggleFlag('frozen', !visibility.frozen) },
    { kind: 'action', label: visibility.renderable === false ? 'Include in render' : 'Exclude from render', disabled: sourceDisabled,
      onSelect: () => options.onToggleFlag('renderable', visibility.renderable === false) },
  )
  items.push({ kind: 'separator' }, {
    kind: 'action', label: removableCount === 0 ? 'Delete selected'
      : removableCount === selectionCount ? `Delete selected (${removableCount})` : `Delete removable objects (${removableCount})`,
    shortcut: 'Del', disabled: sourceDisabled || removableCount === 0,
    disabledReason: sourceDisabled ? 'The 3D source changed while this editor was open.'
      : removableCount === 0 ? 'The primary imported asset and its inner nodes cannot be deleted here.' : undefined,
    onSelect: options.onDelete,
  })
  return items
}
