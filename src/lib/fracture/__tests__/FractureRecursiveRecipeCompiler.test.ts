import { describe, expect, it } from 'vitest'
import { RigidBodyBakeAdapter } from '@/lib/bake/adapters/RigidBodyBakeAdapter'
import { rigidBakeFixture } from '@/lib/bake/__tests__/RigidBodyBakeFixture'
import { makeApplyVoronoiFractureBakeCmd } from '@/lib/editor/commands-voronoi-fracture-bake'
import { PhysicsBakeRecipeFactory } from '@/lib/physics/PhysicsBakeRecipeFactory'
import { assertPhysicsSceneData } from '@/lib/physics/PhysicsSceneValidation'
import { RigidBakeOwnershipInspector } from '@/lib/physics/RigidBakeOwnership'
import { clearRigidBakeOwnedContent } from '@/lib/physics/RigidBakeSceneMutation'
import { assertRigidFractureEvents } from '@/lib/physics/RigidFractureValidation'
import { ResourceBudget } from '@/lib/resources/budget'
import type { RigidBodySnapshot } from '@/lib/types/physics'
import { FractureRecursiveRecipeCompiler } from '../FractureRecursiveRecipeCompiler'
import { VoronoiFractureGenerator } from '../VoronoiFractureGenerator'

function fixture() {
  const base = rigidBakeFixture()
  const scene = {
    ...base.scene,
    layers: base.scene.layers.map(layer => layer.id === 'box'
      ? { ...layer, style: { ...layer.style!, cornerRadius: 0 } }
      : layer),
  }
  const root = new PhysicsBakeRecipeFactory().compileVoronoi(scene, {
    sourceLayerId: 'box', staticLayerIds: ['floor'], timelineId: 'main', durationMs: 3000,
    fractureTimeMs: 500, fragmentCount: 4, seed: 42, generationId: 'recursive-root',
    stepHz: 120, sampleFps: 30, gravity: { x: 0, y: 0 },
  })
  if (root.generation.schemaVersion !== 1) throw new Error('Recursive test requires a convex root')
  const parent = root.generation.fragments[1]
  const child = new VoronoiFractureGenerator().generate({
    generationId: 'recursive-child', sourceOwnerId: parent.id, parentId: parent.id,
    generationIndex: 1, sourcePolygon: parent.polygon, fragmentCount: 3, seed: 99,
  })
  const rootEvent = root.recipe.fractureEvents![0]
  const source = root.recipe.bodies.find(body => body.bodyId === rootEvent.sourceBodyId)!
  const recipe = new FractureRecursiveRecipeCompiler().compile(scene, {
    root: {
      generation: root.generation,
      timelineId: root.recipe.timelineId,
      startTimeMs: root.recipe.startTimeMs,
      durationMs: root.recipe.durationMs,
      fractureTimeMs: rootEvent.timeMs,
      sourceBody: authored(source),
      staticBodies: root.recipe.bodies.filter(body => body.motionType === 'static').map(authored),
      stepHz: root.recipe.stepHz,
      sampleFps: root.recipe.sampleFps,
      pixelsPerMeter: root.recipe.pixelsPerMeter,
      gravityMetersPerSecondSquared: root.recipe.gravityMetersPerSecondSquared,
    },
    children: [{ generation: child, fractureTimeMs: 1000 }],
  })
  return { scene, root: root.generation, child, parent, recipe }
}

describe('FractureRecursiveRecipeCompiler', () => {
  it('compiles ordered parent-child body replacement and admitted lineage', () => {
    const value = fixture()
    expect(() => assertRigidFractureEvents(value.recipe)).not.toThrow()
    expect(value.recipe.fractureEvents).toMatchObject([
      { id: 'recursive-root:event', tick: 60, timeMs: 500 },
      {
        id: 'recursive-child:event', tick: 120, timeMs: 1000,
        sourceBodyId: `rigid:${value.parent.id}`,
      },
    ])
    expect(value.recipe.fractureHierarchy).toMatchObject({
      rootGenerationId: value.root.generationId,
      usage: { depth: 1, generations: 2, fragments: 7 },
    })
    expect(value.recipe.bodies).toHaveLength(1 + 1 + 4 + 3)
    expect(new FractureRecursiveRecipeCompiler().isCurrent(
      value.recipe, [value.root, value.child], value.scene,
    )).toBe(true)
  })

  it('simulates both events and merges the parent visibility transitions', async () => {
    const value = fixture()
    const preview = await new RigidBodyBakeAdapter({
      allocator: new ResourceBudget({ maxBytes: 16 * 1024 ** 2 }),
      yieldEveryTicks: 1000,
    }).prepare(value.recipe, { signal: new AbortController().signal, reportProgress: () => {} })

    const parentOpacity = preview.tracks.find(track => track.target === `layers.${value.parent.id}.opacity`)
    const childOpacity = preview.tracks.find(track => track.target === `layers.${value.child.fragments[0].id}.opacity`)
    expect(parentOpacity?.keyframes.map(key => [key.timeMs, key.value])).toEqual([
      [0, 0], [500, 1], [1000, 0],
    ])
    expect(childOpacity?.keyframes.map(key => [key.timeMs, key.value])).toEqual([
      [0, 0], [1000, 1],
    ])
    expect(preview.recipe.fractureEvents).toHaveLength(2)
    expect(preview.report.protectedEventCount).toBeGreaterThanOrEqual(2)
    preview.release()
  })

  it('publishes, validates, inspects and clears the complete recursive forest', async () => {
    const value = fixture()
    const preview = await new RigidBodyBakeAdapter({
      allocator: new ResourceBudget({ maxBytes: 16 * 1024 ** 2 }),
      yieldEveryTicks: 1000,
    }).prepare(value.recipe, { signal: new AbortController().signal, reportProgress: () => {} })
    const command = makeApplyVoronoiFractureBakeCmd({
      generation: value.root,
      childGenerations: [value.child],
      recipe: preview.recipe,
      tracks: preview.tracks,
      sampleCount: preview.report.sampleCount,
      recordId: 'recursive-bake',
    })
    const committed = command.execute(value.scene)
    const inspection = new RigidBakeOwnershipInspector().inspect(committed, 'recursive-bake')

    expect(committed.physics?.fractureGenerations).toHaveLength(2)
    expect(committed.physics?.rigidBakes[0].fractureGenerations).toHaveLength(2)
    expect(inspection.generations).toHaveLength(2)
    expect(inspection).toMatchObject({ ownershipState: 'current', sourceState: 'current' })
    expect(() => assertPhysicsSceneData(committed.physics)).not.toThrow()
    const cleared = clearRigidBakeOwnedContent(committed, 'recursive-bake')
    expect(cleared.layers).toEqual(value.scene.layers)
    expect(cleared.timelines).toEqual(value.scene.timelines)
    expect(cleared.physics).toBeUndefined()
    preview.release()
  })

  it('rejects a child event at or before its parent activation', () => {
    const value = fixture()
    const source = value.recipe.bodies.find(body => body.layerId === 'box')!
    expect(() => new FractureRecursiveRecipeCompiler().compile(value.scene, {
      root: {
        generation: value.root, timelineId: 'main', startTimeMs: 0, durationMs: 3000,
        fractureTimeMs: 500, sourceBody: authored(source),
        staticBodies: value.recipe.bodies.filter(body => body.motionType === 'static').map(authored),
        stepHz: 120, sampleFps: 30, gravityMetersPerSecondSquared: { x: 0, y: 0 },
      },
      children: [{ generation: value.child, fractureTimeMs: 500 }],
    })).toThrow(/after its parent/)
  })
})

function authored(body: RigidBodySnapshot) {
  return {
    layerId: body.layerId,
    motionType: body.motionType,
    collider: body.collider,
    material: { ...body.material },
    initialVelocityPxPerSecond: { ...body.initialVelocityPxPerSecond },
    initialAngularVelocityDegPerSecond: body.initialAngularVelocityDegPerSecond,
  }
}
