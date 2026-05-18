import { describe, it, expect } from 'vitest'
import {
  parseTrackTarget,
  rebuildTrackTarget,
  remapTrackTarget,
  targetsLayer,
} from '../TrackTargetParser'

describe('parseTrackTarget', () => {
  it('parses layer targets', () => {
    const out = parseTrackTarget('layers.card.opacity')
    expect(out).toEqual({
      entityType: 'layer',
      entityId: 'card',
      propertyPath: 'opacity',
    })
  })

  it('parses deep property paths', () => {
    const out = parseTrackTarget('layers.card.transform.x')
    expect(out).toEqual({
      entityType: 'layer',
      entityId: 'card',
      propertyPath: 'transform.x',
    })
  })

  it('parses multi-level path (pathStroke.trim.offset)', () => {
    const out = parseTrackTarget('layers.path1.pathStroke.trim.offset')
    expect(out).toEqual({
      entityType: 'layer',
      entityId: 'path1',
      propertyPath: 'pathStroke.trim.offset',
    })
  })

  it('parses modifier targets', () => {
    const out = parseTrackTarget('modifiers.bend_1.amount')
    expect(out?.entityType).toBe('modifier')
    expect(out?.entityId).toBe('bend_1')
  })

  it('parses effect targets', () => {
    const out = parseTrackTarget('effects.glow_1.radius')
    expect(out?.entityType).toBe('effect')
  })

  it('parses marker targets (no propertyPath)', () => {
    const out = parseTrackTarget('markers.m1')
    expect(out).toEqual({
      entityType: 'marker',
      entityId: 'm1',
      propertyPath: '',
    })
  })

  it('returns null for unknown namespace', () => {
    expect(parseTrackTarget('unknown.x.y')).toBeNull()
    expect(parseTrackTarget('.bad')).toBeNull()
  })

  it('returns null for malformed strings', () => {
    expect(parseTrackTarget('layers')).toBeNull()
    expect(parseTrackTarget('')).toBeNull()
  })
})

describe('rebuildTrackTarget', () => {
  it('rebuilds layer target with property path', () => {
    const s = rebuildTrackTarget({
      entityType: 'layer',
      entityId: 'card',
      propertyPath: 'opacity',
    })
    expect(s).toBe('layers.card.opacity')
  })

  it('rebuilds with empty propertyPath (marker)', () => {
    const s = rebuildTrackTarget({
      entityType: 'marker',
      entityId: 'm1',
      propertyPath: '',
    })
    expect(s).toBe('markers.m1')
  })

  it('round-trips through parse + rebuild', () => {
    const cases = [
      'layers.card.opacity',
      'layers.card.transform.x',
      'modifiers.bend_1.amount',
      'effects.glow_1.radius',
      'markers.m1',
    ]
    for (const tgt of cases) {
      const parsed = parseTrackTarget(tgt)!
      expect(rebuildTrackTarget(parsed)).toBe(tgt)
    }
  })
})

describe('remapTrackTarget', () => {
  it('remaps entity id when present in idMap', () => {
    const out = remapTrackTarget('layers.card_1.opacity', { card_1: 'card_2' })
    expect(out).toBe('layers.card_2.opacity')
  })

  it('passes through when entity id not in idMap', () => {
    const out = remapTrackTarget('layers.other.opacity', { card_1: 'card_2' })
    expect(out).toBe('layers.other.opacity')
  })

  it('passes through unparseable targets', () => {
    const out = remapTrackTarget('garbage', { foo: 'bar' })
    expect(out).toBe('garbage')
  })

  it('handles multiple ids in the same idMap', () => {
    const idMap = { a: 'A', b: 'B' }
    expect(remapTrackTarget('layers.a.x', idMap)).toBe('layers.A.x')
    expect(remapTrackTarget('layers.b.y', idMap)).toBe('layers.B.y')
  })
})

describe('targetsLayer', () => {
  it('returns true for matching layer targets', () => {
    expect(targetsLayer('layers.card.opacity', 'card')).toBe(true)
  })
  it('returns false for non-matching layer ids', () => {
    expect(targetsLayer('layers.card.opacity', 'other')).toBe(false)
  })
  it('returns false for non-layer entity types', () => {
    expect(targetsLayer('modifiers.card.amount', 'card')).toBe(false)
  })
})
