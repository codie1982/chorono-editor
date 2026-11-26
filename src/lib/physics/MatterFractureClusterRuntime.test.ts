import { describe, expect, it } from 'vitest'
import { rigidBakeFixture } from '@/lib/bake/__tests__/RigidBodyBakeFixture'
import { RigidBodySimulationRunner } from '@/lib/bake/rigid/RigidBodySimulationRunner'
import { PhysicsBakeRecipeFactory } from './PhysicsBakeRecipeFactory'

describe('MatterFractureClusterRuntime', () => {
  it('keeps bonded fragments rigid until a contact breaks and rebuilds components', async () => {
    const fixture = rigidBakeFixture()
    const scene = { ...fixture.scene, layers: fixture.scene.layers.map(layer => layer.id === 'box'
      ? { ...layer, style: { ...layer.style!, cornerRadius: 0 } } : layer) }
    const prepared = new PhysicsBakeRecipeFactory().compileVoronoi(scene, {
      sourceLayerId: 'box',
      staticLayerIds: ['floor'],
      timelineId: 'main',
      durationMs: 1800,
      fractureTimeMs: 100,
      fragmentCount: 6,
      seed: 42,
      generationId: 'runtime-cluster',
      stepHz: 120,
      sampleFps: 30,
      cluster: { defaults: {
        impulseStrength: 0.001,
        damageThreshold: 0.001,
        relativeNormalSpeedScale: 1,
        variation: 0,
      } },
    })

    const result = await new RigidBodySimulationRunner({ yieldEveryTicks: 32 }).simulate(prepared.recipe, {
      signal: new AbortController().signal,
      reportProgress: () => {},
    })
    const breaks = result.events.filter(event => event.kind === 'bond-break')

    expect(breaks.length).toBeGreaterThan(0)
    expect(breaks[0]).toMatchObject({
      bodyIds: [expect.stringMatching(/^rigid:runtime-cluster-fragment-/),
        expect.stringMatching(/^rigid:runtime-cluster-fragment-/)],
      bondBreak: {
        graphId: 'runtime-cluster-cluster',
        reason: expect.stringMatching(/impulse|damage/),
        componentIds: expect.any(Array),
      },
    })
    expect(breaks[0].bondBreak?.componentIds.length).toBeGreaterThan(0)
    expect(result.poses.every(Number.isFinite)).toBe(true)
  })

  it('rejects artistic explosion when bonded compound motion is enabled', () => {
    const fixture = rigidBakeFixture()
    const scene = { ...fixture.scene, layers: fixture.scene.layers.map(layer => layer.id === 'box'
      ? { ...layer, style: { ...layer.style!, cornerRadius: 0 } } : layer) }
    expect(() => new PhysicsBakeRecipeFactory().compileVoronoi(scene, {
      sourceLayerId: 'box', timelineId: 'main', durationMs: 1000, fractureTimeMs: 100,
      fragmentCount: 4, seed: 42, generationId: 'cluster-explosion', cluster: {},
      explosion: { centerLocalOffsetPx: { x: 0, y: 0 }, radialVelocityPxPerSecond: 10,
        directionDeg: 0, directionalVelocityPxPerSecond: 0, spinVelocityDegPerSecond: 0,
        variation: 0, seed: 1 },
    })).toThrow(/cannot be combined/)
  })

  it('materializes a user-forced bond break on its exact fixed tick', async () => {
    const fixture = rigidBakeFixture()
    const scene = { ...fixture.scene, layers: fixture.scene.layers.map(layer => layer.id === 'box'
      ? { ...layer, style: { ...layer.style!, cornerRadius: 0 } } : layer) }
    const common = {
      sourceLayerId: 'box', timelineId: 'main', durationMs: 1000, fractureTimeMs: 100,
      fragmentCount: 5, seed: 7, generationId: 'forced-cluster', stepHz: 100, sampleFps: 20,
    } as const
    const initial = new PhysicsBakeRecipeFactory().compileVoronoi(scene, {
      ...common,
      cluster: { defaults: { impulseStrength: 1e9, damageThreshold: 1e9, variation: 0 } },
    })
    const bondId = initial.recipe.fractureClusters![0].graph.bonds[0].bondId
    const prepared = new PhysicsBakeRecipeFactory().compileVoronoi(scene, {
      ...common,
      cluster: {
        defaults: { impulseStrength: 1e9, damageThreshold: 1e9, variation: 0 },
        forcedBreaks: [{ bondId, timeMs: 200, source: 'user' }],
        damageResets: [{ bondId, timeMs: 150, source: 'user' }],
      },
    })

    const result = await new RigidBodySimulationRunner().simulate(prepared.recipe, {
      signal: new AbortController().signal,
      reportProgress: () => {},
    })
    const forced = result.events.find(event => event.kind === 'bond-break')

    expect(forced).toMatchObject({ tick: 20, timeMs: 200, bondBreak: { bondId, reason: 'forced', load: 0 } })
  })
})
