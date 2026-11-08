import { describe, expect, it } from 'vitest'
import { newRectLayer } from '../../defaults'
import { LayerIndex } from '../../scene/LayerIndex'
import { canvasClonePickTarget } from '../pickTarget'

describe('copy gesture subtree targeting', () => {
  it('keeps the selected child subtree instead of promoting it to the outer parent', () => {
    const outer = { ...newRectLayer(), id: 'outer', type: 'group' as const }
    const selected = { ...newRectLayer(), id: 'selected', parentId: outer.id }
    const painted = { ...newRectLayer(), id: 'painted', parentId: selected.id }
    const index = new LayerIndex([outer, selected, painted])
    expect(canvasClonePickTarget(painted.id, index, new Set([selected.id]))).toBe(selected.id)
    expect(canvasClonePickTarget(painted.id, index, new Set([outer.id]))).toBe(outer.id)
    expect(canvasClonePickTarget(painted.id, index, new Set(), true)).toBe(painted.id)
    expect(canvasClonePickTarget(painted.id, index, new Set())).toBe(outer.id)
  })
})
