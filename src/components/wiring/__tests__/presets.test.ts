import { describe, it, expect } from 'vitest'
import { MAPPING_PRESETS, findMatchingPreset, groupedPresets } from '../presets'

describe('MAPPING_PRESETS catalog', () => {
  it('every preset has a category + label + non-empty expression', () => {
    for (const p of MAPPING_PRESETS) {
      expect(p.category).toBeTruthy()
      expect(p.label).toBeTruthy()
      expect(p.expression.length).toBeGreaterThan(0)
    }
  })

  it('contains at least one preset per documented category', () => {
    const cats = new Set(MAPPING_PRESETS.map((p) => p.category))
    expect(cats).toContain('Identity')
    expect(cats).toContain('Remapping')
    expect(cats).toContain('Boolean')
    expect(cats).toContain('Easing')
    expect(cats).toContain('Trigonometric')
    expect(cats).toContain('Utility')
  })

  it('labels are unique', () => {
    const labels = MAPPING_PRESETS.map((p) => p.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe('findMatchingPreset', () => {
  it('matches identity', () => {
    expect(findMatchingPreset('source')?.label).toBe('Identity')
  })

  it('matches with whitespace differences', () => {
    expect(findMatchingPreset('  source  ')?.label).toBe('Identity')
    expect(findMatchingPreset('map(source,  0,  1,  0, 360)')?.label)
      .toBe('Normalized → degrees')
  })

  it('returns null for custom expressions', () => {
    expect(findMatchingPreset('source * 42')).toBeNull()
    expect(findMatchingPreset('clamp(source * 1.5, 0, 1)')).toBeNull()
  })

  it('returns null for invalid input', () => {
    expect(findMatchingPreset('')).toBeNull()
  })
})

describe('groupedPresets', () => {
  it('returns presets grouped by declared category order', () => {
    const groups = groupedPresets()
    const cats = groups.map((g) => g.category)
    expect(cats).toEqual([
      'Identity', 'Remapping', 'Boolean', 'Easing', 'Trigonometric', 'Utility',
    ])
  })

  it('each group has at least one item', () => {
    for (const g of groupedPresets()) {
      expect(g.items.length).toBeGreaterThan(0)
    }
  })

  it('total items across groups equals MAPPING_PRESETS length', () => {
    const total = groupedPresets().reduce((sum, g) => sum + g.items.length, 0)
    expect(total).toBe(MAPPING_PRESETS.length)
  })
})
