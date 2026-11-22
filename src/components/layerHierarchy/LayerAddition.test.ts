import { describe, expect, it, vi } from 'vitest'
import { ADD_LAYER_GROUPS } from '@/lib/icons/iconMap'
import { buildAddLayerMenu } from '@/components/layers/add/buildAddLayerMenu'

describe('shared Add catalogue', () => {
  it('matches all available + Add categories and dispatches each exact kind once', () => {
    const add = vi.fn(), root = buildAddLayerMenu(add)[0]
    if (root.kind !== 'submenu') throw new Error('Expected Add submenu')
    const menu = root.items
    const groups = ADD_LAYER_GROUPS.filter(group => group.items.some(item => item.available))
    expect(menu.map(item => item.kind !== 'separator' && item.label)).toEqual(groups.map(group => group.title))
    menu.forEach((item, index) => {
      if (item.kind !== 'submenu') throw new Error('Expected Add category')
      const available = groups[index].items.filter(entry => entry.available)
      expect(item.items.map(entry => entry.kind !== 'separator' && entry.label)).toEqual(available.map(entry => entry.label))
      item.items.forEach((entry, j) => {
        if (entry.kind !== 'action') throw new Error('Expected Add action')
        entry.onSelect(); expect(add).toHaveBeenLastCalledWith(available[j].type)
      })
    })
    expect(add).toHaveBeenCalledTimes(groups.flatMap(group => group.items.filter(item => item.available)).length)
  })
})
