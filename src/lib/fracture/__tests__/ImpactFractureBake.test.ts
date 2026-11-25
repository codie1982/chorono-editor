import { describe, expect, it } from 'vitest'
import { rigidBakeFixture } from '@/lib/bake/__tests__/RigidBodyBakeFixture'
import { RigidBodyBakeAdapter, type RigidBodyBakePreview } from '@/lib/bake/adapters/RigidBodyBakeAdapter'
import { PhysicsBakeRecipeFactory, type VoronoiBakeRecipeInput } from '@/lib/physics/PhysicsBakeRecipeFactory'
import { ResourceBudget } from '@/lib/resources/budget'
import { FractureRigidRecipeCompiler } from '../FractureRigidRecipeCompiler'

describe('impact fracture and artistic explosion', () => {
  it('realizes the first qualifying pre-solve contact as the persisted fracture tick', async () => {
    const fixture = createFracture({
      fractureTrigger: {
        kind: 'impact',
        minimumRelativeNormalSpeedPxPerSecond: 50,
        colliderLayerIds: ['floor'],
      },
      gravity: { x: 0, y: 9.81 },
    })
    expect(fixture.recipe.fractureEvents?.[0]).toMatchObject({ timeMs: 0, tick: 0, trigger: { kind: 'impact' } })

    const preview = await prepare(fixture.recipe)
    const event = preview.recipe.fractureEvents![0]
    expect(event.tick).toBeGreaterThan(0)
    expect(event.timeMs).toBeGreaterThan(0)
    expect(event.realization).toMatchObject({
      kind: 'impact',
      contactBodyId: 'rigid:floor',
    })
    expect(event.realization!.relativeNormalSpeedPxPerSecond).toBeGreaterThanOrEqual(50)
    expect(Math.hypot(event.realization!.contactNormal.x, event.realization!.contactNormal.y)).toBeCloseTo(1, 6)
    expect(preview.report.recipeHash).toBe(preview.recipe.recipeHash)
    expect(preview.recipe.recipeHash).not.toBe(fixture.recipe.recipeHash)
    expect(new FractureRigidRecipeCompiler().isCurrent(preview.recipe, fixture.generation, fixture.scene)).toBe(true)
    const sourceVisibility = preview.tracks.find(track => track.target === 'layers.box.opacity')!
    expect(sourceVisibility.keyframes.at(-1)?.timeMs).toBeCloseTo(event.timeMs, 7)
    preview.release()
  })

  it('fails clearly when no contact reaches the authored impact threshold', async () => {
    const fixture = createFracture({
      fractureTrigger: {
        kind: 'impact',
        minimumRelativeNormalSpeedPxPerSecond: 100_000,
        colliderLayerIds: ['floor'],
      },
      gravity: { x: 0, y: 9.81 },
    })
    await expect(prepare(fixture.recipe)).rejects.toThrow(/trigger did not occur/i)
  })

  it('applies deterministic seed-based velocity and spin once at the event', async () => {
    const common: Partial<VoronoiBakeRecipeInput> = {
      fractureTimeMs: 800,
      fractureTrigger: { kind: 'time' },
      gravity: { x: 0, y: 0 },
    }
    const baseline = createFracture(common)
    const exploded = createFracture({
      ...common,
      explosion: {
        centerLocalOffsetPx: { x: 0, y: 0 },
        radialVelocityPxPerSecond: 240,
        directionDeg: 270,
        directionalVelocityPxPerSecond: 40,
        spinVelocityDegPerSecond: 180,
        variation: .2,
        seed: 20261121,
      },
    })
    const [plainPreview, first, second] = await Promise.all([
      prepare(baseline.recipe),
      prepare(exploded.recipe),
      prepare(exploded.recipe),
    ])
    const bodyId = exploded.recipe.fractureEvents![0].fragmentBodyIds[0]
    const plainPose = plainPreview.clip.sample(bodyId, 1000)
    const firstPose = first.clip.sample(bodyId, 1000)
    const secondPose = second.clip.sample(bodyId, 1000)

    expect(firstPose).toEqual(secondPose)
    expect(Math.hypot(firstPose.centerX - plainPose.centerX, firstPose.centerY - plainPose.centerY)).toBeGreaterThan(1)
    expect(Math.abs(firstPose.angleDeg - plainPose.angleDeg)).toBeGreaterThan(.1)
    expect(first.recipe.fractureEvents?.[0].explosion).toEqual(exploded.recipe.fractureEvents?.[0].explosion)
    plainPreview.release(); first.release(); second.release()
  })
})

function createFracture(overrides: Partial<VoronoiBakeRecipeInput>) {
  const fixture = rigidBakeFixture()
  const scene = {
    ...fixture.scene,
    layers: fixture.scene.layers.map(layer => layer.id === 'box'
      ? { ...layer, style: { ...layer.style!, cornerRadius: 0 } }
      : layer),
  }
  const prepared = new PhysicsBakeRecipeFactory().compileVoronoi(scene, {
    sourceLayerId: 'box',
    staticLayerIds: ['floor'],
    timelineId: 'main',
    durationMs: 2000,
    fractureTimeMs: 800,
    fragmentCount: 8,
    seed: 42,
    generationId: 'impact-fracture',
    ...overrides,
  })
  return { scene, ...prepared }
}

function prepare(recipe: ReturnType<typeof createFracture>['recipe']): Promise<RigidBodyBakePreview> {
  return new RigidBodyBakeAdapter({
    allocator: new ResourceBudget({ maxBytes: 32 * 1024 ** 2 }),
    yieldEveryTicks: 1000,
  }).prepare(recipe, { signal: new AbortController().signal, reportProgress: () => {} })
}
