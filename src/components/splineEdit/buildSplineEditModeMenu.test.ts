import { it, expect, vi } from 'vitest'
import { buildSplineEditModeMenu } from './buildSplineEditModeMenu'

it('routes Point/Edge/Object through the shared owner and opens tools after entry', () => {
  const order: string[] = [], onEnter = vi.fn((mode: string) => order.push(mode)), onOpen = vi.fn(() => order.push('open'))
  const menu = buildSplineEditModeMenu({ activeMode: 'edge', onEnter, onOpen })
  expect(menu.kind).toBe('submenu'); if (menu.kind !== 'submenu') throw new Error('Missing Edit Mode')
  expect(menu.label).toBe('Edit Mode')
  expect(menu.items.map(item => item.kind === 'action' && item.label)).toEqual(['Point', 'Edge', 'Object'])
  for (const item of menu.items) if (item.kind === 'action') {
    expect(item.shortcut).toBe(item.label === 'Edge' ? 'Active' : undefined); item.onSelect()
  }
  expect(order).toEqual(['point', 'open', 'edge', 'open', 'object', 'open'])
})

it('returns to layer mode only when the host supplies the exit capability', () => {
  const onDone = vi.fn(), onEnter = vi.fn(), menu = buildSplineEditModeMenu({ onEnter, onDone })
  if (menu.kind !== 'submenu') throw new Error('Missing Edit Mode')
  const exit = menu.items.find(item => item.kind === 'action' && item.label === 'Layer mode')
  if (exit?.kind !== 'action') throw new Error('Missing Layer mode')
  exit.onSelect(); expect(onDone).toHaveBeenCalledOnce(); expect(onEnter).not.toHaveBeenCalled()
})
