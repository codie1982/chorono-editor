import { describe, expect, it } from 'vitest'
import { addPanelToLayout, defaultLayout, findLeafOfPanel, isValidLayout, removePanel } from './layoutOps'
import type { DockLeaf, DockNode } from './types'

/** Includes the registered-but-closed panels, as the real page registry does. */
function registeredPanels(): Set<string> {
  const panels = new Set(['resourceMonitor', 'player', 'scriptConsole', 'curveModifiers'])
  function visit(node: DockNode): void {
    if (node.kind === 'leaf') node.panels.forEach(id => panels.add(id))
    else node.children.forEach(visit)
  }
  visit(defaultLayout())
  return panels
}

describe('resource panel dock integration', () => {
  it('places Edit next to Properties and restores it as an independent tab', () => {
    const tree = defaultLayout()
    const propertiesLeaf = findLeafOfPanel(tree, 'properties')!
    expect(findLeafOfPanel(tree, 'geometryEdit')).toBe(propertiesLeaf)
    expect(findLeafOfPanel(tree, 'splineModeling')).toBeNull()
    const closed = removePanel(tree, 'geometryEdit')
    const opened = addPanelToLayout(closed, 'geometryEdit', 'properties')
    const leaf = findLeafOfPanel(opened, 'geometryEdit')!
    expect(leaf.id).toBe(propertiesLeaf.id)
    expect(leaf.panels[leaf.activeIndex]).toBe('geometryEdit')
  })

  it('restores Edit tools into old layouts without replacing their arrangement', () => {
    const old = removePanel(defaultLayout(), 'geometryEdit'), before = JSON.stringify(old)
    expect(isValidLayout(old, registeredPanels())).toBe(true)
    const opened = addPanelToLayout(old, 'geometryEdit', 'properties')
    expect(findLeafOfPanel(opened, 'geometryEdit')?.id).toBe(findLeafOfPanel(old, 'properties')?.id)
    expect(findLeafOfPanel(opened, 'geometryEdit')?.panels.filter(id => id === 'geometryEdit')).toHaveLength(1)
    expect(JSON.stringify(old)).toBe(before)
    expect(addPanelToLayout(opened, 'geometryEdit', 'canvas')).toBe(opened)
  })
  it('restores a new motion panel beside Properties and respects an existing moved tab', () => {
    const before = defaultLayout(), saved = JSON.stringify(before)
    const opened = addPanelToLayout(before, 'motionKeys', 'properties')
    expect(findLeafOfPanel(opened, 'motionKeys')?.id).toBe(findLeafOfPanel(opened, 'properties')?.id)
    expect(findLeafOfPanel(opened, 'motionKeys')?.panels.filter(id => id === 'motionKeys')).toHaveLength(1)
    expect(JSON.stringify(before)).toBe(saved)
    expect(addPanelToLayout(opened, 'motionKeys', 'layers')).toBe(opened)
  })
  it('accepts old saved layouts missing the new panel and preserves closed panels', () => {
    const old = removePanel(defaultLayout(), 'resourceMonitor')
    const closed = removePanel(old, 'properties')
    expect(isValidLayout(JSON.parse(JSON.stringify(old)), registeredPanels())).toBe(true)
    expect(isValidLayout(closed, registeredPanels())).toBe(true)
    expect(findLeafOfPanel(closed, 'properties')).toBeNull()
  })

  it('focuses and expands an existing panel without moving or duplicating it', () => {
    const tree: DockLeaf = { kind: 'leaf', id: 'saved', panels: ['properties', 'resourceMonitor'], activeIndex: 0, collapsed: true }
    const opened = addPanelToLayout(tree, 'resourceMonitor')
    expect(opened).toMatchObject({ id: 'saved', panels: tree.panels, activeIndex: 1, collapsed: false })
    expect(tree.activeIndex).toBe(0)
    expect(tree.collapsed).toBe(true)
    expect(addPanelToLayout(opened, 'resourceMonitor')).toBe(opened)
    expect(isValidLayout(opened, registeredPanels())).toBe(true)
  })

  it('restores a closed panel once, including into the last empty collapsed leaf', () => {
    const empty: DockLeaf = { kind: 'leaf', id: 'empty', panels: [], activeIndex: 0, collapsed: true }
    expect(isValidLayout(empty, registeredPanels())).toBe(true)
    const restored = addPanelToLayout(empty, 'resourceMonitor')
    expect(restored).toMatchObject({ panels: ['resourceMonitor'], activeIndex: 0, collapsed: false })
    expect(addPanelToLayout(restored, 'resourceMonitor')).toBe(restored)
  })

  it.each([
    { panels: ['resourceMonitor', 'resourceMonitor'], activeIndex: 0 },
    { panels: ['unknown'], activeIndex: 0 },
    { panels: ['resourceMonitor'], activeIndex: 2 },
    { panels: ['resourceMonitor'], activeIndex: -1 },
    { panels: ['resourceMonitor'], activeIndex: 0, collapsed: 'yes' },
  ])('rejects corrupted saved leaf %j', fields => {
    expect(isValidLayout({ kind: 'leaf', id: 'saved', ...fields } as DockNode, registeredPanels())).toBe(false)
  })

  it('rejects duplicate node ids and invalid split geometry', () => {
    const leaf = (id: string): DockLeaf => ({ kind: 'leaf', id, panels: [], activeIndex: 0 })
    const tree: DockNode = { kind: 'split', id: 'root', direction: 'h', ratio: 0.4, children: [leaf('same'), leaf('same')] }
    expect(isValidLayout(tree, registeredPanels())).toBe(false)
    expect(isValidLayout({ ...tree, ratio: NaN, children: [leaf('a'), leaf('b')] }, registeredPanels())).toBe(false)
  })
})
