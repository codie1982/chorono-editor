import { describe, expect, it } from 'vitest'
import { ShortcutRegistry } from './ShortcutRegistry'
import { defaultBindings } from './defaultBindings'
import { resolveCloneDragMode } from './cloneDragGesture'

const plain = { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }

describe('registered clone drag gestures', () => {
  it('uses accelerator or Alt copy and accelerator Shift instance, preserving plain Shift', () => {
    const registry = new ShortcutRegistry(); registry.registerAll(defaultBindings)
    expect(resolveCloneDragMode(plain, registry)).toBeUndefined()
    expect(resolveCloneDragMode({ ...plain, shiftKey: true }, registry)).toBeUndefined()
    expect(resolveCloneDragMode({ ...plain, altKey: true }, registry)).toBe('copy')
    expect(resolveCloneDragMode({ ...plain, ctrlKey: true }, registry)).toBe('copy')
    expect(resolveCloneDragMode({ ...plain, metaKey: true }, registry)).toBe('copy')
    expect(resolveCloneDragMode({ ...plain, ctrlKey: true, shiftKey: true }, registry)).toBe('instance')
    expect(resolveCloneDragMode({ ...plain, metaKey: true, shiftKey: true }, registry)).toBe('instance')
  })
  it('reads an overridden gesture instead of hard-coding default modifiers', () => {
    const registry = new ShortcutRegistry(); registry.registerAll(defaultBindings)
    registry.register({ id: 'canvas.gesture.cloneDrag', label: 'Copy', contexts: ['canvas'],
      binding: { type: 'gesture', gesture: 'drag', modifiers: ['alt'] } })
    expect(resolveCloneDragMode({ ...plain, ctrlKey: true }, registry)).toBeUndefined()
    expect(resolveCloneDragMode({ ...plain, altKey: true }, registry)).toBe('copy')
  })
})
