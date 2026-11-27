import { describe, expect, it } from 'vitest'
import { legacySelectionStyle, selectionModeForModifiers, selectionRegionForTool } from './selectionGesture'

describe('shared empty-space selection routing', () => {
  it('defaults to box with every ordinary tool, including omitted legacy mode', () => {
    for (const mode of [undefined, 'select', 'move', 'rotate', 'scale', 'anchor']) {
      expect(selectionRegionForTool(mode)).toBe('box')
      expect(selectionRegionForTool(mode, 'lasso')).toBe('lasso')
    }
    for (const mode of ['pan', 'pen', 'shape-draw', 'spline-draw', 'unknown']) expect(selectionRegionForTool(mode)).toBeNull()
  })
  it('preserves old explicit style requests without conflating ordinary tools', () => {
    expect(legacySelectionStyle('selection-circle')).toBe('circle')
    expect(selectionRegionForTool('selection-paint')).toBe('paint')
    expect(legacySelectionStyle('move')).toBeNull()
  })
  it('shares replace/add/subtract policy for every shape', () => {
    const plain = { shiftKey: false, ctrlKey: false, metaKey: false, altKey: false }
    expect(selectionModeForModifiers(plain)).toBe('replace')
    for (const field of ['shiftKey', 'ctrlKey', 'metaKey']) expect(selectionModeForModifiers({ ...plain, [field]: true })).toBe('add')
    expect(selectionModeForModifiers({ ...plain, altKey: true })).toBe('subtract')
    expect(selectionModeForModifiers({ ...plain, shiftKey: true, altKey: true })).toBe('add')
  })
})
