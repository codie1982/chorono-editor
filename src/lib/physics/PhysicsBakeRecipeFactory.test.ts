import { describe, expect, it } from 'vitest'
import { rigidBakeFixture } from '@/lib/bake/__tests__/RigidBodyBakeFixture'
import { newCircleLayer, newImageLayer, newSplineLayerFromData, newStarLayer } from '@/lib/defaults'
import { FractureLayerFactory } from '@/lib/fracture/FractureLayerFactory'
import { FractureRegionLayerFactory } from '@/lib/fracture/FractureRegionLayerFactory'
import { Mesh2DTopologyValidator, StructuredGridMesh2DGenerator } from '@/lib/geometry/mesh2d'
import { createRectangleSpline } from '@/lib/spline/primitives/createRectangleSpline'
import type { AnyFractureGeneration, FractureGeneration } from '@/lib/types/fracture'
import { PhysicsBakeRecipeFactory } from './PhysicsBakeRecipeFactory'

describe('PhysicsBakeRecipeFactory', () => {
  it('composes the authoritative rigid compiler without changing recipe semantics', () => {
    const { scene, recipe } = rigidBakeFixture()
    const next = new PhysicsBakeRecipeFactory().compileRigid(scene, {
      timelineId: 'main', durationMs: 3000, stepHz: 120, sampleFps: 30, pixelsPerMeter: 100,
      gravity: { x: 0, y: 9.81 },
      bodies: recipe.bodies.map(body => ({
        layerId: body.layerId,
        motionType: body.motionType,
        material: body.material,
        initialVelocityPxPerSecond: body.initialVelocityPxPerSecond,
        initialAngularVelocityDegPerSecond: body.initialAngularVelocityDegPerSecond,
      })),
    })
    expect(next).toEqual(recipe)
  })

  it('keeps a generated Voronoi manifest paired with its timed rigid recipe', () => {
    const fixture = rigidBakeFixture()
    const scene = { ...fixture.scene, layers: fixture.scene.layers.map(layer => layer.id === 'box'
      ? { ...layer, style: { ...layer.style!, cornerRadius: 0 } } : layer) }
    const prepared = new PhysicsBakeRecipeFactory().compileVoronoi(scene, {
      sourceLayerId: 'box', staticLayerIds: ['floor'], timelineId: 'main', durationMs: 3000,
      fractureTimeMs: 800, fragmentCount: 8, seed: 42, generationId: 'factory-fracture',
    })
    expect(prepared.generation.fragments).toHaveLength(8)
    expect(prepared.recipe.fractureEvents?.[0]).toMatchObject({ timeMs: 800, tick: 96 })
    expect(prepared.recipe.bodies).toHaveLength(10)
    expect(prepared.generation.source.ownerId).toBe('box')
  })

  it('precomputes one admitted child generation with stable lineage', () => {
    const fixture = rigidBakeFixture()
    const scene = { ...fixture.scene, layers: fixture.scene.layers.map(layer => layer.id === 'box'
      ? { ...layer, style: { ...layer.style!, cornerRadius: 0 } } : layer) }
    const prepared = new PhysicsBakeRecipeFactory().compileVoronoi(scene, {
      sourceLayerId: 'box', staticLayerIds: ['floor'], timelineId: 'main', durationMs: 3000,
      fractureTimeMs: 800, fragmentCount: 6, seed: 42, generationId: 'factory-recursive',
      secondary: {
        parentFragmentIndex: 2, fractureTimeMs: 1200, fragmentCount: 3, seed: 84,
        generationId: 'factory-recursive-g1',
        budgets: { maxDepth: 1, maxGenerations: 2, maxFragments: 16 },
      },
    })

    expect(prepared.generations).toHaveLength(2)
    expect(prepared.recipe.fractureEvents).toMatchObject([
      { id: 'factory-recursive:event', timeMs: 800, tick: 96 },
      { id: 'factory-recursive-g1:event', timeMs: 1200, tick: 144 },
    ])
    expect(prepared.recipe.fractureHierarchy).toMatchObject({
      rootGenerationId: 'factory-recursive',
      usage: { depth: 1, generations: 2, fragments: 9 },
      limits: { maxDepth: 1, maxGenerations: 2, maxFragments: 16 },
    })
  })

  it('pairs an optional deterministic bond graph with the fracture event', () => {
    const fixture = rigidBakeFixture()
    const scene = { ...fixture.scene, layers: fixture.scene.layers.map(layer => layer.id === 'box'
      ? { ...layer, style: { ...layer.style!, cornerRadius: 0 } } : layer) }
    const prepared = new PhysicsBakeRecipeFactory().compileVoronoi(scene, {
      sourceLayerId: 'box', staticLayerIds: ['floor'], timelineId: 'main', durationMs: 3000,
      fractureTimeMs: 800, fragmentCount: 8, seed: 42, generationId: 'clustered-fracture',
      cluster: { defaults: { impulseStrength: 20, damageThreshold: 50 } },
    })

    expect(prepared.recipe.fractureClusters).toHaveLength(1)
    expect(prepared.recipe.fractureClusters?.[0]).toMatchObject({
      eventId: 'clustered-fracture:event',
      strategy: 'compoundBody',
      graph: { generationId: 'clustered-fracture', fragmentIds: expect.any(Array) },
    })
    expect(prepared.recipe.fractureClusters?.[0].graph.bonds.length).toBeGreaterThan(0)
  })

  it('captures image provenance and produces texture-backed fragment Mesh2D layers', () => {
    const fixture = rigidBakeFixture()
    const image = {
      ...newImageLayer('poster', 100, 100),
      id: 'poster-layer',
      name: 'Poster',
      transform: { ...fixture.box.transform },
      image: { assetId: 'poster', objectFit: 'cover' as const },
    }
    const scene = {
      ...fixture.scene,
      layers: [image, fixture.floor],
      assets: [{ id: 'poster', name: 'Poster.png', type: 'image' as const, url: 'embedded:poster', width: 640, height: 360 }],
    }
    const prepared = new PhysicsBakeRecipeFactory().compileVoronoi(scene, {
      sourceLayerId: image.id, staticLayerIds: [fixture.floor.id], timelineId: 'main', durationMs: 3000,
      fractureTimeMs: 800, fragmentCount: 8, seed: 42, generationId: 'image-fracture',
    })
    const generation = legacyGeneration(prepared.generation)
    const fragments = new FractureLayerFactory().create(scene, generation, prepared.recipe)

    expect(prepared.recipe.fractureAppearance).toMatchObject({
      kind: 'image', sourceLayerId: image.id, assetId: 'poster', objectFit: 'cover',
    })
    expect(fragments).toHaveLength(8)
    expect(fragments.every(layer => layer.type === 'mesh2d'
      && layer.mesh2d?.source.kind === 'fractureFragment'
      && layer.mesh2d.appearance?.textureAssetId === 'poster')).toBe(true)
  })

  it.each([
    ['circle shape', () => ({ ...newCircleLayer(), id: 'convex-circle', name: 'Convex Circle' })],
    ['closed spline', () => ({
      ...newSplineLayerFromData(createRectangleSpline({ width: 120, height: 80 }), { name: 'Convex Spline' }),
      style: { fill: { type: 'solid' as const, color: '#3B82F6' } },
      id: 'convex-spline',
    })],
  ])('compiles a %s through convex source, solver and editable path fragments', (_label, createSource) => {
    const fixture = rigidBakeFixture()
    const source = createSource()
    source.transform = { ...source.transform, x: 240, y: 120, scaleX: 1, scaleY: 1 }
    const scene = { ...fixture.scene, layers: [source, fixture.floor] }

    const prepared = new PhysicsBakeRecipeFactory().compileVoronoi(scene, {
      sourceLayerId: source.id, staticLayerIds: [fixture.floor.id], timelineId: 'main', durationMs: 3000,
      fractureTimeMs: 800, fragmentCount: 8, seed: 42, generationId: `convex-${source.type}`,
    })
    const sourceBody = prepared.recipe.bodies[0]
    const generation = legacyGeneration(prepared.generation)
    const fragments = new FractureLayerFactory().create(scene, generation, prepared.recipe)

    expect(sourceBody.collider).toBe('convexPolygon')
    expect(sourceBody.colliderVerticesPx?.length).toBe(generation.source.polygon.length)
    expect(sourceBody.visual.centerOfMassLocalPx).toEqual(generation.source.polygon.length === 4
      ? { x: 0, y: 0 }
      : expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }))
    expect(prepared.recipe.fractureAppearance).toMatchObject({ kind: 'solid', sourceLayerId: source.id })
    expect(fragments).toHaveLength(8)
    expect(fragments.every(layer => layer.type === 'path')).toBe(true)
  })

  it('compiles a convex Mesh2D source into UV-preserving Mesh2D fragments', () => {
    const fixture = rigidBakeFixture()
    const mesh2d = new StructuredGridMesh2DGenerator().generate({
      width: 120,
      height: 80,
      columns: 3,
      rows: 2,
      diagonal: 'topLeftToBottomRight',
    })
    const source = {
      ...fixture.box,
      id: 'convex-mesh',
      name: 'Convex Mesh',
      type: 'mesh2d' as const,
      size: { width: 120, height: 80 },
      mesh2d,
      transform: { ...fixture.box.transform, x: 240, y: 120, scaleX: 1, scaleY: 1 },
    }
    const scene = { ...fixture.scene, layers: [source, fixture.floor] }
    const prepared = new PhysicsBakeRecipeFactory().compileVoronoi(scene, {
      sourceLayerId: source.id,
      staticLayerIds: [fixture.floor.id],
      timelineId: 'main',
      durationMs: 3000,
      fractureTimeMs: 800,
      fragmentCount: 8,
      seed: 42,
      generationId: 'convex-mesh',
    })
    const fragments = new FractureLayerFactory().create(scene, legacyGeneration(prepared.generation), prepared.recipe)

    expect(prepared.recipe.bodies[0].collider).toBe('convexPolygon')
    expect(prepared.recipe.fractureAppearance).toMatchObject({ kind: 'mesh2d', sourceLayerId: source.id })
    expect(fragments).toHaveLength(8)
    expect(fragments.every(layer => layer.type === 'mesh2d'
      && layer.mesh2d?.source.kind === 'fractureFragment')).toBe(true)
    fragments.forEach(layer => {
      expect(new Mesh2DTopologyValidator().validate(layer.mesh2d!.geometry).valid).toBe(true)
    })
  })

  it('compiles a concave source into region Mesh2D layers and compound colliders', () => {
    const fixture = rigidBakeFixture()
    const source = {
      ...newStarLayer(),
      id: 'concave-star',
      name: 'Concave Star',
      transform: { ...fixture.box.transform, x: 240, y: 120, scaleX: 1, scaleY: 1 },
    }
    const scene = { ...fixture.scene, layers: [source, fixture.floor] }
    const prepared = new PhysicsBakeRecipeFactory().compileVoronoi(scene, {
      sourceLayerId: source.id,
      staticLayerIds: [fixture.floor.id],
      timelineId: 'main',
      durationMs: 3000,
      fractureTimeMs: 800,
      fragmentCount: 8,
      seed: 42,
      generationId: 'concave-star-generation',
    })

    expect(prepared.generation.schemaVersion).toBe(2)
    if (prepared.generation.schemaVersion !== 2) throw new Error('Expected FRACTURE1 region topology')
    const fragments = new FractureRegionLayerFactory().create(scene, prepared.generation, prepared.recipe)
    expect(prepared.recipe.bodies[0].collider).toBe('compoundPolygon')
    expect(prepared.recipe.bodies.slice(2).every(body => body.collider === 'compoundPolygon'
      && body.colliderPartsPx?.length)).toBe(true)
    expect(fragments).toHaveLength(prepared.generation.fragments.length)
    expect(fragments.every(layer => layer.type === 'mesh2d'
      && layer.mesh2d?.source.kind === 'fractureFragment')).toBe(true)
  })
})

function legacyGeneration(generation: AnyFractureGeneration): FractureGeneration {
  expect(generation.schemaVersion).toBe(1)
  if (generation.schemaVersion !== 1) throw new Error('Expected a convex FRACTURE0 generation')
  return generation
}
