import { describe, expect, it, vi } from 'vitest'
import { newRectLayer } from '@/lib/defaults'
import { itemDetailMenu } from './detailMenu'
import { buildCanvasMenu } from '@/components/canvas/buildCanvasMenu'
import { buildSceneExplorerMenu } from '@/components/sceneExplorer/buildSceneExplorerMenu'

describe('detail entry points preserve selection and legacy menus', () => {
  it('separates one-item content edits from multi-selection isolation', () => {
    const layer = newRectLayer(), edit = vi.fn(), isolate = vi.fn()
    const menu = itemDetailMenu(layer, 2, edit, isolate)
    expect(menu[0]).toMatchObject({ label: 'Edit content…', disabled: true })
    expect(menu[1]).toMatchObject({ label: 'Isolate selection', disabled: false })
    if (menu[1].kind === 'action') menu[1].onSelect()
    expect(isolate).toHaveBeenCalledOnce(); expect(edit).not.toHaveBeenCalled()
    expect(itemDetailMenu(layer, 1)).toEqual([])
  })
  it('uses the same capability restriction in Canvas and Explorer, retaining their existing actions', () => {
    const layer = { ...newRectLayer(), locked: true }, edit = vi.fn()
    const canvas = buildCanvasMenu({ layer, multiCount: 1, canPaste: false, canUngroup: false, handlers: { editContent: edit } })
    expect(canvas[0]).toMatchObject({ label: 'Edit content…', disabled: true, disabledReason: expect.stringContaining('Unlock') })
    const explorer = buildSceneExplorerMenu({ target: layer, selectionIds: [layer.id], allLayers: [layer], handlers: {
      editContent: edit, rename: vi.fn(), duplicate: vi.fn(), deleteLayers: vi.fn(), groupLayers: vi.fn(), setColorLabel: vi.fn(), bulkToggleFlag: vi.fn(),
    } })
    expect(explorer[0]).toMatchObject({ label: 'Edit content…', disabled: true })
    expect(explorer.some(item => item.kind === 'action' && item.label === 'Rename')).toBe(true)
    expect(itemDetailMenu({ ...layer, type: 'video', locked: false }, 1, edit)[0]).toMatchObject({ disabledReason: expect.stringContaining('not available') })
  })
})
