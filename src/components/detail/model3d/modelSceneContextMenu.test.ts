import { describe, expect, it, vi } from 'vitest'
import { buildModelSceneContextMenu } from './modelSceneContextMenu'

/** Menu labels must reveal partial deletion and never offer a source edit for
 * the primary imported model or a stale detail draft. */
describe('3D object context menu', () => {
  const actions = () => ({ onSelectAll: vi.fn(), onClearSelection: vi.fn(), onToggleIsolation: vi.fn(), onDelete: vi.fn(), onToggleFlag: vi.fn() })

  it('offers selection and a single bulk delete for removable objects', () => {
    const handlers = actions()
    const menu = buildModelSceneContextMenu({ ...handlers, selectionCount: 3, selectableCount: 5, removableCount: 2,
      isolationActive: false, sourceDisabled: false })
    const deleteItem = menu.find(item => item.kind === 'action' && item.label.startsWith('Delete'))
    expect(deleteItem).toMatchObject({ label: 'Delete removable objects (2)', disabled: false })
    if (deleteItem?.kind === 'action') deleteItem.onSelect()
    expect(handlers.onDelete).toHaveBeenCalledOnce()
  })

  it('explains why imported source nodes cannot be deleted', () => {
    const menu = buildModelSceneContextMenu({ ...actions(), selectionCount: 1, selectableCount: 1, removableCount: 0,
      isolationActive: false, sourceDisabled: false })
    expect(menu.find(item => item.kind === 'action' && item.label.startsWith('Delete'))).toMatchObject({ disabled: true,
      disabledReason: expect.stringContaining('primary imported asset') })
  })

  it('offers inline rename only for a concrete Explorer object row', () => {
    const handlers = { ...actions(), onRename: vi.fn() }
    const menu = buildModelSceneContextMenu({ ...handlers, selectionCount: 1, selectableCount: 1, removableCount: 1,
      isolationActive: false, sourceDisabled: false })
    const rename = menu.find(item => item.kind === 'action' && item.label === 'Rename')
    expect(rename).toMatchObject({ kind: 'action', disabled: false })
    if (rename?.kind === 'action') rename.onSelect()
    expect(handlers.onRename).toHaveBeenCalledOnce()
    expect(buildModelSceneContextMenu({ ...actions(), selectionCount: 1, selectableCount: 1, removableCount: 1,
      isolationActive: false, sourceDisabled: false }).some(item => item.kind === 'action' && item.label === 'Rename')).toBe(false)
  })

  it('explains Edit Mode eligibility and enters only when the primitive is eligible', () => {
    const onEditMode = vi.fn()
    const options = { ...actions(), onEditMode, selectionCount: 1, selectableCount: 1, removableCount: 1,
      isolationActive: false, sourceDisabled: false }
    const disabled = buildModelSceneContextMenu({ ...options, editModeReason: 'Unfreeze this primitive before editing.' })
      .find(item => item.kind === 'action' && item.label === 'Edit Mode')
    expect(disabled).toMatchObject({ disabled: true, disabledReason: 'Unfreeze this primitive before editing.' })
    const active = buildModelSceneContextMenu(options).find(item => item.kind === 'action' && item.label === 'Edit Mode')
    expect(active).toMatchObject({ disabled: false })
    if (active?.kind === 'action') active.onSelect()
    expect(onEditMode).toHaveBeenCalledOnce()
  })
})
