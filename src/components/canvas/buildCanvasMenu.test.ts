import { describe, expect, it, vi } from 'vitest'
import { newRectLayer } from '@/lib/defaults'
import { buildCanvasMenu } from './buildCanvasMenu'

describe('canvas multi-selection menu contract', () => {
  it('names the full selection and disables primary-only commands instead of silently editing one object', () => {
    const remove = vi.fn(), group = vi.fn()
    const menu = buildCanvasMenu({ layer: newRectLayer(), multiCount: 3, canUngroup: false, canPaste: false,
      handlers: { deleteLayer: remove, group, rotate90CW: vi.fn(), centerOrigin: vi.fn(), toggleLock: vi.fn(),
        duplicate: vi.fn(), animateProperty: vi.fn(), alignLeft: vi.fn() } })
    const item = menu.find(item => item.kind === 'action' && item.label === 'Delete 3 layers')
    if (item?.kind !== 'action') throw new Error('Missing selection delete')
    expect(item.disabled).toBe(false); item.onSelect(); expect(remove).toHaveBeenCalledOnce()
    expect(menu.find(item => item.kind === 'action' && item.label === 'Group')).toMatchObject({ disabled: false })
    for (const label of ['Center origin', 'Rotate 90° right', 'Lock', 'Animate', 'Arrange']) {
      expect(menu.find(item => 'label' in item && item.label === label)).toMatchObject({ disabled: true })
    }
    const align = menu.find(item => item.kind === 'submenu' && item.label === 'Align')
    expect(align).toMatchObject({ disabled: false })
  })
})
