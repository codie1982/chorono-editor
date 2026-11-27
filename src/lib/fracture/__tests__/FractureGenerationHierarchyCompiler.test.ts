import { describe, expect, it } from 'vitest'
import { FractureGenerationHierarchyCompiler } from '../FractureGenerationHierarchyCompiler'
import { VoronoiFractureGenerator } from '../VoronoiFractureGenerator'

const generator = new VoronoiFractureGenerator()

function hierarchy() {
  const root = generator.generate({
    generationId: 'root-generation', sourceOwnerId: 'source',
    sourcePolygon: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 120 }, { x: 0, y: 120 }],
    fragmentCount: 4, seed: 42,
  })
  const parent = root.fragments[1]
  const child = generator.generate({
    generationId: 'child-generation', sourceOwnerId: parent.id, parentId: parent.id,
    generationIndex: 1, sourcePolygon: parent.polygon, fragmentCount: 3, seed: 99,
  })
  return { root, child }
}

describe('FractureGenerationHierarchyCompiler', () => {
  it('derives stable lineage and realized resource usage', () => {
    const { root, child } = hierarchy()
    const result = new FractureGenerationHierarchyCompiler().compile([root, child])

    expect(result.rootGenerationId).toBe(root.generationId)
    expect(result.entries[1]).toEqual({
      generationId: child.generationId,
      generationIndex: 1,
      parentGenerationId: root.generationId,
      parentFragmentId: root.fragments[1].id,
    })
    expect(result.usage).toMatchObject({ depth: 1, generations: 2, fragments: 7 })
    expect(result.usage.triangles).toBeGreaterThanOrEqual(7)
    expect(result.usage.portableBytes).toBeGreaterThan(0)
    expect(result.hierarchyHash).toMatch(/^[a-f0-9]{16}$/)
    expect(new FractureGenerationHierarchyCompiler().compile([root, child]).hierarchyHash)
      .toBe(result.hierarchyHash)
  })

  it('rejects missing parents, invalid depth and every resource limit', () => {
    const { root, child } = hierarchy()
    const compiler = new FractureGenerationHierarchyCompiler()
    const orphan = { ...child, parentId: 'missing', source: { ...child.source, ownerId: 'missing' } }
    expect(() => compiler.compile([root, orphan])).toThrow(/lineage|stale/)
    expect(() => compiler.compile([root, child], { maxDepth: 1, maxGenerations: 1 })).toThrow(/generation count/)
    expect(() => compiler.compile([root, child], { maxDepth: 1, maxFragments: 6 })).toThrow(/fragment count/)
    expect(() => compiler.compile([root, child], { maxDepth: 1, maxTriangles: 1 })).toThrow(/triangle count/)
    expect(() => compiler.compile([root, child], { maxDepth: 1, maxPortableBytes: 1 })).toThrow(/portable byte count/)
  })
})
