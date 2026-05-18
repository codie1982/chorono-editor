import { describe, it, expect } from 'vitest'
import { cloneSingleLayer } from '../CloneSingleLayer'
import type { Layer } from '../../types'

function makeRect(overrides: Partial<Layer> = {}): Layer {
  return {
    id: 'rect_1',
    name: 'Rect 1',
    type: 'shape',
    shape: 'rect',
    transform: {
      x: 100,
      y: 50,
      scaleX: 1,
      scaleY: 1,
      rotationDeg: 0,
      anchorX: 0,
      anchorY: 0,
    },
    opacity: 1,
    ...overrides,
  }
}

describe('cloneSingleLayer', () => {
  it('produces a layer with a fresh id', () => {
    const src = makeRect()
    const { clonedLayer } = cloneSingleLayer(src)
    expect(clonedLayer.id).not.toBe(src.id)
  })

  it('preserves shape + transform values', () => {
    const src = makeRect()
    const { clonedLayer } = cloneSingleLayer(src)
    expect(clonedLayer.shape).toBe('rect')
    expect(clonedLayer.transform.x).toBe(100)
    expect(clonedLayer.transform.y).toBe(50)
  })

  it('applies offset to transform.x and transform.y', () => {
    const src = makeRect()
    const { clonedLayer } = cloneSingleLayer(src, { offsetX: 20, offsetY: 40 })
    expect(clonedLayer.transform.x).toBe(120)
    expect(clonedLayer.transform.y).toBe(90)
  })

  it('returns idMap with old → new', () => {
    const src = makeRect()
    const { clonedLayer, idMap } = cloneSingleLayer(src)
    expect(idMap[src.id]).toBe(clonedLayer.id)
  })

  it('attaches metadata pointing back at sourceId', () => {
    const src = makeRect()
    const { clonedLayer, metadata } = cloneSingleLayer(src)
    expect(metadata.sourceId).toBe(src.id)
    expect(metadata.mode).toBe('copy')
    expect(metadata.createdAt).toBeGreaterThan(0)
    // arrayGroupId not set by default
    expect(metadata.arrayGroupId).toBeUndefined()
    // Layer itself should NOT carry _cloneMeta (clean export contract)
    expect((clonedLayer as any)._cloneMeta).toBeUndefined()
  })

  it('honors arrayGroupId when supplied', () => {
    const src = makeRect()
    const { metadata } = cloneSingleLayer(src, { arrayGroupId: 'array_xyz' })
    expect(metadata.arrayGroupId).toBe('array_xyz')
  })

  it('honors nameOverride', () => {
    const src = makeRect()
    const { clonedLayer } = cloneSingleLayer(src, { nameOverride: 'Custom Name' })
    expect(clonedLayer.name).toBe('Custom Name')
  })

  it('defaults name to "X Copy"', () => {
    const src = makeRect({ name: 'My Rect' })
    const { clonedLayer } = cloneSingleLayer(src)
    expect(clonedLayer.name).toBe('My Rect Copy')
  })

  it('throws for unsupported modes (reference / virtual)', () => {
    const src = makeRect()
    expect(() => cloneSingleLayer(src, { mode: 'reference' })).toThrow()
    expect(() => cloneSingleLayer(src, { mode: 'virtual' })).toThrow()
  })

  it('instance mode produces a tagged copy (geometry identical, mode recorded)', () => {
    const src = makeRect()
    const { clonedLayer, metadata } = cloneSingleLayer(src, { mode: 'instance' })
    expect(clonedLayer.id).not.toBe(src.id)
    expect(clonedLayer.shape).toBe('rect')
    expect(metadata.mode).toBe('instance')
    expect(metadata.sourceId).toBe(src.id)
  })

  it('clone is deeply independent (mutating one does not affect the other)', () => {
    const src = makeRect()
    const { clonedLayer } = cloneSingleLayer(src)
    clonedLayer.transform.x = 9999
    expect(src.transform.x).toBe(100)
  })
})
