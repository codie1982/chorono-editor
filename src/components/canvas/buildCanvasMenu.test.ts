import { describe, expect, it, vi } from 'vitest'
import { newRectLayer, newTextLayer } from '@/lib/defaults'
import type { MenuItem } from '@/components/ui/ContextMenu'
import { buildCanvasMenu } from './buildCanvasMenu'

/** Flatten public menu labels, including nested command surfaces. */
function labels(items: MenuItem[]): string[] {
  return items.flatMap(item => item.kind === 'separator' ? []
    : [item.label, ...(item.kind === 'submenu' ? labels(item.items) : [])])
}

describe('canvas context selection scope', () => {
  it('exposes both native conversion targets for compatible multi-selection', () => {
    const layer = newRectLayer(), convert = vi.fn(), mesh = vi.fn()
    const menu = buildCanvasMenu({ layer, multiCount: 2, selectedLayers: [layer, newRectLayer()],
      canUngroup: false, canPaste: false, handlers: { convertToPath: convert, convertToMesh2D: mesh } })
    const submenu = menu.find(item => item.kind === 'submenu' && item.label === 'Convert')!
    expect(submenu.kind).toBe('submenu')
    if (submenu.kind !== 'submenu') return
    expect(labels(submenu.items)).toEqual(['Convert Spline', 'Convert 2D Mesh'])
    const action = submenu.items[1]
    if (action.kind === 'action') action.onSelect()
    expect(mesh).toHaveBeenCalledOnce()
  })
  it('exposes a dedicated bulk lock handler with a label matching all selected flags', () => {
    const layer = newRectLayer(), other = { ...newRectLayer(), locked: true }, lock = vi.fn()
    const build = (locked: boolean) => buildCanvasMenu({ layer, multiCount: 2,
      selectedLayers: [{ ...layer, locked }, other], canUngroup: false, canPaste: false,
      handlers: { toggleSelectionLock: lock } })
    const command = build(false).find(item => item.kind === 'action' && item.label === 'Lock selection')!
    if (command.kind !== 'action') throw new Error('Bulk lock missing')
    command.onSelect()
    expect(lock).toHaveBeenCalledOnce()
    expect(labels(build(true))).toContain('Unlock selection')
  })
  it('excludes primary-only actions even when their handlers are available', () => {
    const layer = newRectLayer(), other = newRectLayer(), duplicate = vi.fn()
    const menu = buildCanvasMenu({ layer, multiCount: 2, selectedLayers: [layer, other], canUngroup: true, canPaste: true,
      handlers: { duplicate, toggleLock: vi.fn(), centerOrigin: vi.fn(), rotate90CW: vi.fn(),
        flipHorizontal: vi.fn(), bringForward: vi.fn(), ungroup: vi.fn(), cloneAlignToSelected: vi.fn() } })
    const actual = labels(menu)
    for (const label of ['Lock', 'Unlock', 'Center origin', 'Rotate 90° right', 'Flip horizontal',
      'Arrange', 'Ungroup', 'Assign motion path…', 'Clone & Align to selected targets', 'Bake Repeater to layers']) {
      expect(actual).not.toContain(label)
    }
    expect(actual).toEqual(expect.arrayContaining(['Group', 'Delete', 'Duplicate', 'Array…', 'Align']))
    const clipboard = menu.find(item => item.kind === 'submenu' && item.label === 'Copy / Paste')!
    if (clipboard.kind !== 'submenu') throw new Error('Missing clipboard submenu')
    const command = clipboard.items.find(item => item.kind === 'action' && item.label === 'Duplicate')!
    if (command.kind === 'action') command.onSelect()
    expect(duplicate).toHaveBeenCalledOnce()
  })

  it('keeps single-object tools and limits mixed-selection animation to common source channels', () => {
    const layer = newRectLayer(), text = newTextLayer()
    const base = { layer, canUngroup: false, canPaste: false, handlers: { animateProperty: vi.fn() } }
    expect(labels(buildCanvasMenu({ ...base, multiCount: 1 }))).toContain('Lock')
    const menu = buildCanvasMenu({ ...base, multiCount: 2, selectedLayers: [layer, text] })
    const animation = menu.find(item => item.kind === 'submenu' && item.label === 'Animate')!
    expect(animation.kind).toBe('submenu')
    if (animation.kind !== 'submenu') return
    expect(labels(animation.items)).toEqual(expect.arrayContaining(['Opacity', 'X', 'Y']))
    expect(labels(animation.items)).not.toContain('Corner Radius')
    expect(labels(animation.items)).not.toContain('Follow Progress')
  })
})
