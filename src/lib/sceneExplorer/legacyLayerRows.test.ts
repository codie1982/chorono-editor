import { describe, expect, it } from 'vitest'
import { newRectLayer } from '@/lib/defaults'
import { buildLegacyLayerRows } from './legacyLayerRows'

describe('legacy layer rows', () => {
  it('retains reversed stacking, hierarchy, original indices and collapse', () => {
    const root = { ...newRectLayer(), id: 'root', type: 'group' as const }
    const a = { ...newRectLayer(), id: 'a', parentId: root.id }
    const b = { ...newRectLayer(), id: 'b', parentId: root.id }
    const top = { ...newRectLayer(), id: 'top' }
    const layers = [root, a, b, top]
    expect(buildLegacyLayerRows(layers, new Set()).map(row => [row.layer.id, row.realIdx, row.depth]))
      .toEqual([['top', 3, 0], ['root', 0, 0], ['b', 2, 1], ['a', 1, 1]])
    expect(buildLegacyLayerRows(layers, new Set(['root'])).map(row => row.layer.id)).toEqual(['top', 'root'])
    expect(layers).toHaveLength(4)
  })

  it('does not promote orphans or change the legacy empty-parent behavior', () => {
    const layer = newRectLayer()
    expect(buildLegacyLayerRows([{ ...layer, parentId: 'missing' }, { ...layer, id: 'empty', parentId: '' }], new Set())).toEqual([])
  })

  it('traverses a 3000-deep hierarchy without exhausting the call stack', () => {
    const base = newRectLayer()
    const layers = Array.from({ length: 3000 }, (_, i) => ({ ...base, id: `layer-${i}`,
      parentId: i ? `layer-${i - 1}` : undefined }))
    const rows = buildLegacyLayerRows(layers, new Set())
    expect(rows).toHaveLength(3000)
    expect(rows[2999].depth).toBe(2999)
    expect(buildLegacyLayerRows(layers, new Set(['layer-1']))).toHaveLength(2)
  })
})
