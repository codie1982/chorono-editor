import { describe, expect, it } from 'vitest'
import { migrateDockLayout } from './migrateDockLayout'
import { defaultLayout, findLeafOfPanel, isValidLayout } from './layoutOps'
import type { DockNode } from './types'

describe('retired settings panel migration', () => {
  it.each(['splineModeling', 'splineTools'])('renames legacy %s in place and preserves the active tab', legacyId => {
    const legacy: DockNode = { kind: 'leaf', id: 'custom', panels: ['assets', legacyId, 'properties'], activeIndex: 1, collapsed: true }
    const next = migrateDockLayout(legacy)
    expect(next).toEqual({ ...legacy, panels: ['assets', 'geometryEdit', 'properties'] })
    expect(migrateDockLayout(next)).toBe(next)
  })

  it('keeps an existing Edit tab and does not reopen one that was closed', () => {
    const mixed: DockNode = { kind: 'leaf', id: 'custom', panels: ['splineModeling', 'geometryEdit', 'assets'], activeIndex: 1 }
    expect(migrateDockLayout(mixed)).toEqual({ ...mixed, panels: ['geometryEdit', 'assets'], activeIndex: 0 })
    const closed: DockNode = { ...mixed, panels: ['assets'], activeIndex: 0 }
    expect(migrateDockLayout(closed)).toBe(closed)
  })

  it('removes only legacy Snap/Shortcuts while preserving active panels, ratios and closed state', () => {
    const tree: DockNode = { kind: 'split', id: 'custom', direction: 'h', ratio: .37, children: [
      { kind: 'leaf', id: 'main', panels: ['canvas', 'timeline'], activeIndex: 1 },
      { kind: 'leaf', id: 'right', panels: ['snap', 'shortcuts', 'properties', 'assets'], activeIndex: 2, collapsed: true },
    ] }
    const before = structuredClone(tree), next = migrateDockLayout(tree), leaf = findLeafOfPanel(next, 'properties')!
    expect(tree).toEqual(before); expect(next).toMatchObject({ id: 'custom', ratio: .37 })
    expect(leaf).toEqual({ ...before.children[1], panels: ['properties', 'assets'], activeIndex: 0 })
    expect(findLeafOfPanel(next, 'canvas')).toEqual(before.children[0])
    expect(findLeafOfPanel(next, 'snap')).toBeNull(); expect(findLeafOfPanel(next, 'shortcuts')).toBeNull()
    expect(isValidLayout(next, new Set(['canvas', 'timeline', 'properties', 'assets']))).toBe(true)
    expect(migrateDockLayout(next)).toBe(next)
  })
  it('collapses an emptied legacy leaf and preserves its sibling exactly', () => {
    const sibling = { kind: 'leaf' as const, id: 'main', panels: ['canvas'], activeIndex: 0 }
    const tree: DockNode = { kind: 'split', id: 'old', direction: 'v', ratio: .6, children: [sibling, { kind: 'leaf', id: 'retired', panels: ['snap', 'shortcuts'], activeIndex: 1 }] }
    expect(migrateDockLayout(tree)).toBe(sibling)
  })
  it('falls back to default only when retiring the last remaining panels', () => {
    expect(migrateDockLayout({ kind: 'leaf', id: 'old', panels: ['snap', 'shortcuts'], activeIndex: 0 })).toEqual(defaultLayout())
    const alreadyEmpty: DockNode = { kind: 'leaf', id: 'closed', panels: [], activeIndex: 0 }
    expect(migrateDockLayout(alreadyEmpty)).toBe(alreadyEmpty)
  })
})
