import { describe, expect, it } from 'vitest'
import { ShortcutRegistry } from './ShortcutRegistry'
import { defaultBindings } from './defaultBindings'

describe('timeline shortcut defaults without overwriting custom assignments', () => {
  it('also preserves a prior global K command while installing intentional context defaults', () => {
    const registry = new ShortcutRegistry()
    registry.register({ id: 'custom.global', label: 'Custom global', contexts: ['global'], binding: { type: 'keyboard', key: 'k' } })
    registry.registerDefaults(defaultBindings)
    expect(registry.displayString('timeline.keyframe.set')).toBe('')
    const event = { key: 'ArrowLeft', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false } as KeyboardEvent
    expect(registry.resolve(event, 'canvas')).toBe('canvas.nudge.left')
    expect(registry.resolve(event, 'timeline')).toBe('global.playback.stepBack')
  })
  it('assigns K to Set Key, comma/period to keys and retains J as a labelled legacy previous key alias', () => {
    const registry = new ShortcutRegistry(); registry.registerDefaults(defaultBindings)
    const event = (key: string) => ({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }) as KeyboardEvent
    expect(registry.resolve(event('k'), 'timeline')).toBe('timeline.keyframe.set')
    expect(registry.resolve(event('.'), 'timeline')).toBe('timeline.nav.nextKeyframe')
    expect(registry.resolve(event(','), 'timeline')).toBe('timeline.nav.prevKeyframe')
    expect(registry.resolve(event('j'), 'timeline')).toBe('timeline.nav.prevKeyframeLegacy')
  })
  it('preserves an explicitly registered old K assignment, leaving the new command unassigned', () => {
    const registry = new ShortcutRegistry()
    registry.register({ id: 'timeline.nav.nextKeyframe', label: 'Custom next', contexts: ['timeline'], binding: { type: 'keyboard', key: 'k' } })
    registry.registerDefaults(defaultBindings)
    expect(registry.getById('timeline.nav.nextKeyframe')?.binding).toEqual({ type: 'keyboard', key: 'k' })
    expect(registry.displayString('timeline.keyframe.set')).toBe('')
    registry.registerDefaults(defaultBindings)
    expect(registry.getById('timeline.nav.nextKeyframe')?.label).toBe('Custom next')
  })
})
