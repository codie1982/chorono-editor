import { describe, it, expect } from 'vitest'
import {
  sameScale, sameRotation, sameEdgeDistance, sameType, sameOpacity,
  findSimilar, findSimilarIds, matchesAllCriteria,
} from '../SimilarityMatcher'
import type { Layer } from '../../types'
import { DEFAULT_SIMILARITY } from '../types'

function makeLayer(p: {
  id: string
  type?: string
  x?: number; y?: number
  scaleX?: number; scaleY?: number
  rotation?: number
  opacity?: number
  anchorX?: number; anchorY?: number
}): Layer {
  return {
    id: p.id,
    name: p.id,
    type: (p.type ?? 'shape') as Layer['type'],
    transform: {
      x: p.x ?? 0, y: p.y ?? 0,
      scaleX: p.scaleX ?? 1, scaleY: p.scaleY ?? 1,
      rotationDeg: p.rotation ?? 0,
      anchorX: p.anchorX ?? 0, anchorY: p.anchorY ?? 0,
    },
    opacity: p.opacity ?? 1,
    hidden: false, locked: false,
  } as unknown as Layer
}

const CANVAS = { width: 1920, height: 1080 }

describe('sameScale', () => {
  it('exact match', () => {
    const a = makeLayer({ id: 'a', scaleX: 1, scaleY: 1 })
    const b = makeLayer({ id: 'b', scaleX: 1, scaleY: 1 })
    expect(sameScale(a, b, 0)).toBe(true)
  })

  it('within tolerance %', () => {
    const a = makeLayer({ id: 'a', scaleX: 1.0, scaleY: 1.0 })   // avg 1.0
    const b = makeLayer({ id: 'b', scaleX: 1.04, scaleY: 1.04 }) // avg 1.04 ≈ +4%
    expect(sameScale(a, b, 5)).toBe(true)
    expect(sameScale(a, b, 3)).toBe(false)
  })

  it('handles non-uniform via average', () => {
    const a = makeLayer({ id: 'a', scaleX: 2, scaleY: 0 })  // avg 1
    const b = makeLayer({ id: 'b', scaleX: 0, scaleY: 2 })  // avg 1
    expect(sameScale(a, b, 0)).toBe(true)
  })

  it('handles zero-scale reference', () => {
    const a = makeLayer({ id: 'a', scaleX: 0, scaleY: 0 })
    const b = makeLayer({ id: 'b', scaleX: 0.04, scaleY: 0.04 })
    expect(sameScale(a, b, 5)).toBe(true)  // 5/100 = 0.05 absolute
    expect(sameScale(a, b, 3)).toBe(false)
  })
})

describe('sameRotation', () => {
  it('exact', () => {
    expect(sameRotation(
      makeLayer({ id: 'a', rotation: 45 }),
      makeLayer({ id: 'b', rotation: 45 }),
      0,
    )).toBe(true)
  })

  it('within tolerance', () => {
    expect(sameRotation(
      makeLayer({ id: 'a', rotation: 45 }),
      makeLayer({ id: 'b', rotation: 48 }),
      5,
    )).toBe(true)
  })

  it('handles wraparound (350° vs 10°)', () => {
    expect(sameRotation(
      makeLayer({ id: 'a', rotation: 350 }),
      makeLayer({ id: 'b', rotation: 10 }),
      25,
    )).toBe(true)
  })
})

describe('sameEdgeDistance', () => {
  it('matches when all 4 edges are within tolerance', () => {
    const a = makeLayer({ id: 'a', x: 100, y: 100 })
    const b = makeLayer({ id: 'b', x: 105, y: 95 })
    expect(sameEdgeDistance(a, b, CANVAS, 10)).toBe(true)
  })

  it('rejects when any edge differs by > tolerance', () => {
    const a = makeLayer({ id: 'a', x: 100, y: 100 })
    const b = makeLayer({ id: 'b', x: 100, y: 500 })  // top/bottom mismatch
    expect(sameEdgeDistance(a, b, CANVAS, 10)).toBe(false)
  })

  it('includes anchorX/Y in the edge computation', () => {
    const a = makeLayer({ id: 'a', x: 100, y: 100, anchorX: 20, anchorY: 20 })
    const b = makeLayer({ id: 'b', x: 120, y: 120, anchorX: 0,  anchorY: 0 })
    // a's effective x = 120, b's effective x = 120 — match
    expect(sameEdgeDistance(a, b, CANVAS, 0)).toBe(true)
  })
})

describe('sameType', () => {
  it('exact-equal type field', () => {
    expect(sameType(
      makeLayer({ id: 'a', type: 'image' }),
      makeLayer({ id: 'b', type: 'image' }),
    )).toBe(true)
    expect(sameType(
      makeLayer({ id: 'a', type: 'image' }),
      makeLayer({ id: 'b', type: 'text' }),
    )).toBe(false)
  })
})

describe('sameOpacity', () => {
  it('within tolerance', () => {
    expect(sameOpacity(
      makeLayer({ id: 'a', opacity: 0.5 }),
      makeLayer({ id: 'b', opacity: 0.52 }),
      0.05,
    )).toBe(true)
    expect(sameOpacity(
      makeLayer({ id: 'a', opacity: 0.5 }),
      makeLayer({ id: 'b', opacity: 0.6 }),
      0.05,
    )).toBe(false)
  })
})

describe('findSimilar — composite matching', () => {
  const ref = makeLayer({
    id: 'ref', type: 'shape',
    x: 100, y: 100,
    scaleX: 1, scaleY: 1,
    rotation: 45,
    opacity: 0.8,
  })

  const all: Layer[] = [
    ref,
    // matches scale + rotation + type (default options)
    makeLayer({ id: 'm1', type: 'shape', scaleX: 1.02, scaleY: 1.02, rotation: 47 }),
    // different type → fails default options
    makeLayer({ id: 'm2', type: 'text', scaleX: 1, scaleY: 1, rotation: 45 }),
    // different rotation (> 5°)
    makeLayer({ id: 'm3', type: 'shape', scaleX: 1, scaleY: 1, rotation: 90 }),
    // different scale (> 5%)
    makeLayer({ id: 'm4', type: 'shape', scaleX: 1.5, scaleY: 1.5, rotation: 45 }),
  ]

  it('default options (matchType + matchScale + matchRotation)', () => {
    const result = findSimilar(ref, all, DEFAULT_SIMILARITY, CANVAS)
    const ids = new Set(result.map((l) => l.id))
    expect(ids.has('ref')).toBe(true)
    expect(ids.has('m1')).toBe(true)
    expect(ids.has('m2')).toBe(false) // type mismatch
    expect(ids.has('m3')).toBe(false) // rotation mismatch
    expect(ids.has('m4')).toBe(false) // scale mismatch
  })

  it('disabling matchType lets m2 in', () => {
    const result = findSimilar(ref, all, { ...DEFAULT_SIMILARITY, matchType: false }, CANVAS)
    const ids = new Set(result.map((l) => l.id))
    expect(ids.has('m2')).toBe(true)
  })

  it('relaxing rotation tolerance lets m3 in', () => {
    const result = findSimilar(ref, all, {
      ...DEFAULT_SIMILARITY,
      rotationToleranceDeg: 50,
    }, CANVAS)
    const ids = new Set(result.map((l) => l.id))
    expect(ids.has('m3')).toBe(true)
  })

  it('all toggles off matches every layer', () => {
    const noToggles = {
      ...DEFAULT_SIMILARITY,
      matchType: false, matchScale: false, matchRotation: false,
      matchPosition: false, matchOpacity: false,
    }
    const result = findSimilar(ref, all, noToggles, CANVAS)
    expect(result).toHaveLength(all.length)
  })

  it('includes the reference layer in results', () => {
    const result = findSimilar(ref, all, DEFAULT_SIMILARITY, CANVAS)
    expect(result.some((l) => l.id === 'ref')).toBe(true)
  })

  it('findSimilarIds returns a Set of ids', () => {
    const ids = findSimilarIds(ref, all, DEFAULT_SIMILARITY, CANVAS)
    expect(ids).toBeInstanceOf(Set)
    expect(ids.has('ref')).toBe(true)
    expect(ids.has('m1')).toBe(true)
  })
})

describe('matchesAllCriteria — disabled toggles short-circuit', () => {
  it('disabled toggle is ignored even when mismatch exists', () => {
    const a = makeLayer({ id: 'a', type: 'image', opacity: 0.5 })
    const b = makeLayer({ id: 'b', type: 'text',  opacity: 0.6 })
    // matchType OFF + matchOpacity OFF → trivially match
    expect(matchesAllCriteria(a, b, {
      ...DEFAULT_SIMILARITY,
      matchType: false, matchOpacity: false,
      matchScale: false, matchRotation: false, matchPosition: false,
    }, CANVAS)).toBe(true)
  })
})
