import { describe, expect, it } from 'vitest'
import { ShortcutRegistry } from './ShortcutRegistry'
import { defaultBindings } from './defaultBindings'
describe('geometry Edit level defaults', () => {
  it.each(['1', '2', '3'])('maps %s only in canvas/spline/layer contexts', key => {
    const registry = new ShortcutRegistry(); registry.registerDefaults(defaultBindings)
    const event = { key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false } as KeyboardEvent
    const id = `canvas.edit.${['point', 'edge', 'object'][Number(key) - 1]}`
    expect(registry.resolve(event, 'canvas')).toBe(id)
    expect(registry.resolve(event, 'splineEdit')).toBe(id)
    expect(registry.resolve(event, 'layerPanel')).toBe(id)
    for (const context of ['timeline', 'textEdit', 'model3d', 'preview'] as const) expect(registry.resolve(event, context)).toBeNull()
    expect(registry.resolve({ ...event, shiftKey: true } as KeyboardEvent, 'canvas')).toBeNull()
  })
})
