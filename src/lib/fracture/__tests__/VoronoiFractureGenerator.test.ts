import { describe, expect, it } from 'vitest'
import { ConvexPolygon2D } from '../ConvexPolygon2D'
import { FractureManifestValidator } from '../FractureManifestValidator'
import { VoronoiFractureGenerator } from '../VoronoiFractureGenerator'

const rectangle = [
  { x: 0, y: 0 }, { x: 640, y: 0 }, { x: 640, y: 360 }, { x: 0, y: 360 },
] as const

describe('VoronoiFractureGenerator', () => {
  it('creates a deterministic portable 32-fragment topology', () => {
    const generator = new VoronoiFractureGenerator()
    const input = { generationId: 'panel-v1', sourceOwnerId: 'panel', sourcePolygon: rectangle,
      fragmentCount: 32, seed: 0x12345678 }
    const first = generator.generate(input)
    const second = generator.generate(input)

    expect(second).toEqual(first)
    expect(first).toMatchObject({
      schemaVersion: 1, generationIndex: 0, parentId: 'panel', requestedFragmentCount: 32,
      algorithm: { id: 'd3-delaunay', version: '6.0.4', compilerVersion: 2 },
    })
    expect(first.topologyHash).toMatch(/^[0-9a-f]{16}$/)
    expect(first.seeds).toHaveLength(32)
    expect(first.fragments).toHaveLength(32)
    expect(new Set(first.fragments.map(fragment => fragment.id))).toHaveProperty('size', 32)
    expect(first.fragments.every(fragment => /^[\w-]{1,128}$/.test(fragment.id))).toBe(true)
    expect(first.fragments[0].id).toBe('panel-v1-fragment-0')
    expect(first.seeds[0].id).toBe('panel-v1-seed-0')
    expect(() => new FractureManifestValidator().validate(first)).not.toThrow()
  })

  it('preserves a convex non-rectangular source area without repeated closing vertices', () => {
    const source = [
      { x: 180, y: 0 }, { x: 360, y: 120 }, { x: 300, y: 320 },
      { x: 60, y: 320 }, { x: 0, y: 120 }, { x: 180, y: 0 },
    ]
    const normalized = new ConvexPolygon2D(source)
    const generation = new VoronoiFractureGenerator().generate({
      generationId: 'hex-v1', sourceOwnerId: 'hex', sourcePolygon: source, fragmentCount: 16, seed: 7,
    })
    const area = generation.fragments.reduce((sum, fragment) => sum + fragment.areaPx2, 0)

    expect(area).toBeCloseTo(normalized.area, 6)
    expect(generation.fragments.every(fragment => fragment.polygon.length >= 3)).toBe(true)
    expect(generation.fragments.every(fragment => {
      const first = fragment.polygon[0], last = fragment.polygon[fragment.polygon.length - 1]
      return first.x !== last.x || first.y !== last.y
    })).toBe(true)
    expect(() => new FractureManifestValidator().validate(generation)).not.toThrow()
  })

  it('changes realized geometry when the root seed changes', () => {
    const generator = new VoronoiFractureGenerator()
    const shared = { generationId: 'panel-v1', sourceOwnerId: 'panel', sourcePolygon: rectangle, fragmentCount: 16 }
    expect(generator.generate({ ...shared, seed: 1 }).topologyHash)
      .not.toBe(generator.generate({ ...shared, seed: 2 }).topologyHash)
  })

  it('retries whole generations for slivers and fails without dropping area', () => {
    expect(() => new VoronoiFractureGenerator().generate({
      generationId: 'strict', sourceOwnerId: 'panel', sourcePolygon: rectangle,
      fragmentCount: 32, seed: 1, minimumAreaRatio: 0.99, maxGenerationAttempts: 2,
    })).toThrow(/minimum fragment area/)
  })

  it.each([
    { name: 'concave source', polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 4, y: 4 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
    { name: 'zero-area source', polygon: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }] },
    { name: 'duplicate edge', polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }] },
  ])('rejects $name before D3 allocation', ({ polygon }) => {
    expect(() => new VoronoiFractureGenerator().generate({
      generationId: 'invalid', sourceOwnerId: 'source', sourcePolygon: polygon, fragmentCount: 4, seed: 1,
    })).toThrow()
  })

  it('detects changed persisted geometry instead of trusting the stored hash', () => {
    const generation = new VoronoiFractureGenerator().generate({
      generationId: 'panel-v1', sourceOwnerId: 'panel', sourcePolygon: rectangle, fragmentCount: 16, seed: 77,
    })
    const fragment = generation.fragments[0]
    const changed = {
      ...generation,
      fragments: [{ ...fragment, areaPx2: fragment.areaPx2 + 1 }, ...generation.fragments.slice(1)],
    }
    expect(() => new FractureManifestValidator().validate(changed)).toThrow(/area is stale/)
  })

  it('enforces the first-slice fragment and seed budgets', () => {
    const generator = new VoronoiFractureGenerator()
    const base = { generationId: 'panel-v1', sourceOwnerId: 'panel', sourcePolygon: rectangle, seed: 1 }
    expect(() => generator.generate({ ...base, fragmentCount: 1 })).toThrow(/2–100/)
    expect(() => generator.generate({ ...base, fragmentCount: 101 })).toThrow(/2–100/)
    expect(() => generator.generate({ ...base, fragmentCount: 16, seed: -1 })).toThrow(/unsigned/)
    expect(() => generator.generate({ ...base, generationId: 'invalid:id', fragmentCount: 16 })).toThrow(/ASCII/)
    expect(() => generator.generate({ ...base, generationId: 'x'.repeat(117), fragmentCount: 16 })).toThrow(/1–116/)
  })
})
