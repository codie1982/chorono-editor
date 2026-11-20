import { describe, expect, it } from 'vitest'
import { placeContextMenu } from './ContextMenuPlacement'

describe('context menu viewport placement', () => {
  const menu = { width: 220, height: 250, viewportWidth: 1000, viewportHeight: 600 }

  it('keeps a fitting root or right-opening submenu at its anchor', () => {
    expect(placeContextMenu({ ...menu, x: 100, y: 90 })).toEqual({ left: 100, top: 90 })
    expect(placeContextMenu({ ...menu, x: 316, y: 90, parentLeft: 100 })).toEqual({ left: 316, top: 90 })
  })

  it('clamps a root near the right/bottom edge within the viewport', () => {
    expect(placeContextMenu({ ...menu, x: 900, y: 550 })).toEqual({ left: 776, top: 346 })
  })

  it('opens a constrained submenu to the left without covering its parent action', () => {
    const position = placeContextMenu({ ...menu, x: 1016, y: 90, parentLeft: 800 })
    expect(position).toEqual({ left: 584, top: 90 })
    expect(position.left + menu.width).toBe(804)
    expect(position.left + menu.width).toBeLessThan(800 + menu.width / 2)
  })

  it('uses the viewport margin when neither side can contain an oversized menu', () => {
    expect(placeContextMenu({ ...menu, x: 190, y: 150, viewportWidth: 200, viewportHeight: 200, parentLeft: 10 }))
      .toEqual({ left: 4, top: 4 })
  })
})
