import { describe, expect, it } from 'vitest'
import { rigidBakeFixture } from '@/lib/bake/__tests__/RigidBodyBakeFixture'
import { newImageLayer } from '@/lib/defaults'
import { FractureLayerFactory } from '@/lib/fracture/FractureLayerFactory'
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
    const fragments = new FractureLayerFactory().create(scene, prepared.generation, prepared.recipe)

    expect(prepared.recipe.fractureAppearance).toMatchObject({
      kind: 'image', sourceLayerId: image.id, assetId: 'poster', objectFit: 'cover',
    })
    expect(fragments).toHaveLength(8)
    expect(fragments.every(layer => layer.type === 'mesh2d'
      && layer.mesh2d?.source.kind === 'fractureFragment'
      && layer.mesh2d.appearance?.textureAssetId === 'poster')).toBe(true)
  })
})
