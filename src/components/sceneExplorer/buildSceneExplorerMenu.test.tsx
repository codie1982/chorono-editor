import {describe, expect, it, vi} from 'vitest'
import {newRectLayer} from '@/lib/defaults'
import {buildSceneExplorerMenu, type SceneExplorerMenuHandlers} from './buildSceneExplorerMenu'

/** Menu capability and selection contract; subtree traversal belongs to LayerIndex. */
function fixture() {
  const target = {...newRectLayer(), id: 'parent', type: 'group' as const}
  const child = {...newRectLayer(), id: 'child', parentId: target.id}
  const handlers: SceneExplorerMenuHandlers = {
    rename: vi.fn(), duplicate: vi.fn(), deleteLayers: vi.fn(), groupLayers: vi.fn(),
    setColorLabel: vi.fn(), bulkToggleFlag: vi.fn(),
    expandSubtrees: vi.fn(), collapseSubtrees: vi.fn(), setSubtreeHidden: vi.fn(),
  }
  return {target, allLayers: [target, child], handlers}
}

describe('Scene Explorer subtree menu', () => {
  it('passes all selected roots to explicit subtree actions without changing ordinary flag scope', () => {
    const input = fixture(), selectionIds = ['parent', 'child']
    const menu = buildSceneExplorerMenu({...input, selectionIds})
    const branch = menu.find(item => item.kind === 'submenu' && item.label === 'Subtree (selected + children)')
    expect(branch?.kind).toBe('submenu')
    if (branch?.kind !== 'submenu') throw new Error('Missing subtree menu')
    for (const item of branch.items) if (item.kind === 'action') item.onSelect()
    expect(input.handlers.expandSubtrees).toHaveBeenCalledWith(selectionIds)
    expect(input.handlers.collapseSubtrees).toHaveBeenCalledWith(selectionIds)
    expect(input.handlers.setSubtreeHidden).toHaveBeenNthCalledWith(1, selectionIds, false)
    expect(input.handlers.setSubtreeHidden).toHaveBeenNthCalledWith(2, selectionIds, true)
    expect(input.handlers.bulkToggleFlag).not.toHaveBeenCalled()
  })

  it('targets a single parent with no selection and disables missing visibility capabilities', () => {
    const input = fixture()
    input.handlers.setSubtreeHidden = undefined
    const menu = buildSceneExplorerMenu({...input, selectionIds: []})
    const branch = menu.find(item => item.kind === 'submenu' && item.label === 'Subtree (selected + children)')
    if (branch?.kind !== 'submenu') throw new Error('Missing subtree menu')
    const expand = branch.items.find(item => item.kind === 'action' && item.label === 'Expand subtree')
    if (expand?.kind === 'action') expand.onSelect()
    expect(input.handlers.expandSubtrees).toHaveBeenCalledWith(['parent'])
    expect(branch.items.filter(item => item.kind === 'action' && item.disabled)).toHaveLength(2)
  })
})
