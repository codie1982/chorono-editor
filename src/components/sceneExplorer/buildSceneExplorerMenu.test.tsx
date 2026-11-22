import {describe, expect, it, vi} from 'vitest'
import {newRectLayer, newSplineLayerFromData} from '@/lib/defaults'
import {createRectangleSpline} from '@/lib/spline'
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
  it('offers Edit Mode for one spline and forwards the explicit target without source changes', () => {
    const input = fixture(), target = newSplineLayerFromData(createRectangleSpline({ width: 50, height: 50 }), { name: 'Spline', x: 0, y: 0 }), splineEditMode = vi.fn()
    const allLayers = [...input.allLayers, target], before = JSON.stringify(allLayers), handlers = { ...input.handlers, splineEditMode }
    const menu = buildSceneExplorerMenu({ target, allLayers, handlers, selectionIds: [target.id] })
    const mode = menu.find(item => item.kind === 'submenu' && item.label === 'Edit Mode')
    if (mode?.kind !== 'submenu') throw new Error('Missing Edit Mode')
    const edge = mode.items.find(item => item.kind === 'action' && item.label === 'Edge')
    if (edge?.kind !== 'action') throw new Error('Missing Edge')
    edge.onSelect(); expect(splineEditMode).toHaveBeenCalledExactlyOnceWith(target.id, 'edge')
    expect(JSON.stringify(allLayers)).toBe(before)
    expect(buildSceneExplorerMenu({ target, allLayers, handlers, selectionIds: [target.id, 'parent'] }).some(item => item.kind === 'submenu' && item.label === 'Edit Mode')).toBe(false)
    expect(buildSceneExplorerMenu({ target: input.target, allLayers, handlers, selectionIds: ['parent'] }).some(item => item.kind === 'submenu' && item.label === 'Edit Mode')).toBe(false)
  })
  it('duplicates the selected forest once when the atomic host capability exists', () => {
    const input = fixture(), duplicateLayers = vi.fn(), selectionIds = ['parent', 'child']
    const menu = buildSceneExplorerMenu({ ...input, selectionIds, handlers: { ...input.handlers, duplicateLayers } })
    const item = menu.find(item => item.kind === 'action' && item.label === 'Duplicate (2)')
    if (item?.kind !== 'action') throw new Error('Missing multi duplicate')
    item.onSelect()
    expect(duplicateLayers).toHaveBeenCalledExactlyOnceWith(selectionIds)
    expect(input.handlers.duplicate).not.toHaveBeenCalled()
  })
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
    expect(branch.items.filter(item => item.kind === 'action' && item.disabled)).toHaveLength(8)
  })
})
