import { describe, expect, it, vi } from 'vitest'
import { activateAudioClipSelection } from './audioClipSelection'

describe('audio clip versus gain-key selection', () => {
  it('clears stale gain keys before a normal clip-body or header selection', () => {
    for (const interaction of ['clip', 'header'] as const) {
      let selectedKeys = new Set(['old-gain-key'])
      const order: string[] = []
      activateAudioClipSelection(interaction, false, shift => {
        expect(shift).toBe(false)
        expect(selectedKeys.size).toBe(0)
        order.push('select-layer')
      }, () => { selectedKeys = new Set<string>(); order.push('clear-keys') })
      expect(order).toEqual(['clear-keys', 'select-layer'])
    }
  })
  it('preserves a gain-key selection group for pointer and keyboard key activation', () => {
    const clear = vi.fn()
    const select = vi.fn()
    activateAudioClipSelection('gainKey', false, select, clear)
    activateAudioClipSelection('gainKey', true, select, clear)
    expect(clear).not.toHaveBeenCalled()
    expect(select.mock.calls).toEqual([[false], [true]])
  })
  it('preserves Shift-additive layer selection', () => {
    const clear = vi.fn(), select = vi.fn()
    activateAudioClipSelection('header', true, select, clear)
    activateAudioClipSelection('clip', true, select, clear)
    expect(clear).not.toHaveBeenCalled()
    expect(select).toHaveBeenCalledWith(true)
  })
})
