import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import { RigidBodyBakeAdapter } from '@/lib/bake/adapters/RigidBodyBakeAdapter'
import { makeApplyVoronoiFractureBakeCmd } from '@/lib/editor/commands-voronoi-fracture-bake'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'
import { assertPhysicsSceneData } from '@/lib/physics/PhysicsSceneValidation'
import { ResourceBudget } from '@/lib/resources/budget'
import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
import type { ChronoScene, Layer } from '@/lib/types'
import type { RigidBodyAuthoring } from '@/lib/types/physics'
import { FractureLayerFactory } from '../FractureLayerFactory'
import { FractureRigidRecipeCompiler } from '../FractureRigidRecipeCompiler'
import { VoronoiFractureGenerator } from '../VoronoiFractureGenerator'

describe('Voronoi rigid bake integration', () => {
  it('compiles centroid colliders and preserves the assembled source appearance', () => {
    const fixture = fractureFixture()
    const event = fixture.recipe.fractureEvents![0]
    const fragments = fixture.recipe.bodies.filter(body => body.activation)
    const layers = new FractureLayerFactory().create(fixture.scene.layers, fixture.generation, fixture.recipe)

    expect(event).toMatchObject({ timeMs: 1000, tick: 120, sourceBodyId: 'rigid:panel' })
    expect(fragments).toHaveLength(16)
    expect(fragments.every(body => body.collider === 'convexPolygon'
      && body.colliderVerticesPx!.length >= 3
      && body.activation?.eventId === event.id)).toBe(true)
    expect(layers).toHaveLength(16)
    layers.forEach((layer, index) => {
      const point = fixture.generation.fragments[index].polygon[0]
      expect(worldPoint(layer, point).x).toBeCloseTo(worldPoint(fixture.panel, point).x, 7)
      expect(worldPoint(layer, point).y).toBeCloseTo(worldPoint(fixture.panel, point).y, 7)
      expect(layer.transform.anchorX).toBeCloseTo(fixture.generation.fragments[index].centroidPx.x, 9)
      expect(layer.transform.anchorY).toBeCloseTo(fixture.generation.fragments[index].centroidPx.y, 9)
    })
  })

  it('replaces the source at the event tick and transfers linear/angular motion', async () => {
    const fixture = fractureFixture()
    const adapter = new RigidBodyBakeAdapter({
      allocator: new ResourceBudget({ maxBytes: 32 * 1024 ** 2 }),
      yieldEveryTicks: 1000,
    })
    const preview = await adapter.prepare(fixture.recipe, {
      signal: new AbortController().signal,
      reportProgress: () => {},
    })
    const eventSample = 30
    const sourcePose = preview.clip.poseAt('rigid:panel', eventSample)
    const atEvent = weightedCentroid(fixture, preview, eventSample)
    const afterEvent = weightedCentroid(fixture, preview, eventSample + 1)

    expect(atEvent.x).toBeCloseTo(sourcePose.centerX, 6)
    expect(atEvent.y).toBeCloseTo(sourcePose.centerY, 6)
    expect(afterEvent.x - atEvent.x).toBeCloseTo(4, 1)
    expect(afterEvent.y - atEvent.y).toBeCloseTo(1, 1)
    expect(preview.tracks).toHaveLength(68)
    const sourceOpacity = preview.tracks.find(track => track.target === 'layers.panel.opacity')!
    const fragmentOpacity = preview.tracks.find(track => track.target === `layers.${fixture.generation.fragments[0].id}.opacity`)!
    expect(sourceOpacity.keyframes.map(key => key.value)).toEqual([1, 0])
    expect(fragmentOpacity.keyframes.map(key => key.value)).toEqual([0, 1])
    preview.release()
  })

  it('commits layers, tracks and portable topology atomically and undoes exactly', async () => {
    const fixture = fractureFixture()
    const preview = await new RigidBodyBakeAdapter({
      allocator: new ResourceBudget({ maxBytes: 32 * 1024 ** 2 }),
      yieldEveryTicks: 1000,
    }).prepare(fixture.recipe, { signal: new AbortController().signal, reportProgress: () => {} })
    const command = makeApplyVoronoiFractureBakeCmd({
      generation: fixture.generation,
      recipe: fixture.recipe,
      tracks: preview.tracks,
      sampleCount: preview.report.sampleCount,
      recordId: 'panel-fracture-v1',
    })
    const committed = command.execute(fixture.scene)

    expect(committed.layers).toHaveLength(fixture.scene.layers.length + 16)
    expect(committed.timelines[0].tracks).toHaveLength(68)
    expect(committed.physics?.rigidBakes[0]).toMatchObject({ id: 'panel-fracture-v1', sampleCount: 61 })
    expect(committed.physics?.fractureGenerations?.[0].topologyHash).toBe(fixture.generation.topologyHash)
    expect(evaluateSceneFrame(committed, 999).overrides.get('layers.panel.opacity')).toBe(1)
    expect(evaluateSceneFrame(committed, 1000).overrides.get('layers.panel.opacity')).toBe(0)
    expect(evaluateSceneFrame(committed, 999).overrides.get(`layers.${fixture.generation.fragments[0].id}.opacity`)).toBe(0)
    expect(evaluateSceneFrame(committed, 1000).overrides.get(`layers.${fixture.generation.fragments[0].id}.opacity`)).toBe(1)
    expect(() => assertPhysicsSceneData(committed.physics)).not.toThrow()
    expect(parseSceneJson(JSON.stringify(committed), true)).toEqual(committed)
    expect(command.undo(committed)).toEqual(fixture.scene)
    preview.release()
  })

  it('rejects a stale source before publishing any fragment', async () => {
    const fixture = fractureFixture()
    const preview = await new RigidBodyBakeAdapter({ allocator: new ResourceBudget({ maxBytes: 32 * 1024 ** 2 }) })
      .prepare(fixture.recipe, { signal: new AbortController().signal, reportProgress: () => {} })
    const stale = {
      ...fixture.scene,
      layers: fixture.scene.layers.map(layer => layer.id === 'panel'
        ? { ...layer, size: { width: layer.size!.width + 1, height: layer.size!.height } }
        : layer),
    }
    const command = makeApplyVoronoiFractureBakeCmd({
      generation: fixture.generation, recipe: fixture.recipe, tracks: preview.tracks,
      sampleCount: preview.report.sampleCount,
    })
    expect(() => command.execute(stale)).toThrow(/source changed/)
    expect(stale.layers).toHaveLength(2)
    preview.release()
  })
})

function fractureFixture() {
  const panel: Layer = {
    ...newRectLayer(), id: 'panel', name: 'Breakable Panel', size: { width: 320, height: 180 },
    transform: { x: 180, y: 80, scaleX: 1, scaleY: 1, rotationDeg: 15, anchorX: 160, anchorY: 90 },
    style: { fill: { type: 'solid', color: '#3B82F6' }, cornerRadius: 0 }, opacity: 1,
  }
  const floor: Layer = {
    ...newRectLayer(), id: 'floor', name: 'Floor', size: { width: 900, height: 40 },
    transform: { x: 0, y: 700, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 450, anchorY: 20 },
    style: { fill: { type: 'solid', color: '#475569' }, cornerRadius: 0 },
  }
  const base = emptyScene()
  const scene: ChronoScene = {
    ...base,
    composition: { ...base.composition, width: 900, height: 760, durationMs: 2000, frameRate: 30 },
    layers: [panel, floor],
    timelines: [{ id: 'main', durationMs: 2000, autoplay: false, loop: false, tracks: [], layerIds: [] }],
  }
  const generation = new VoronoiFractureGenerator().generate({
    generationId: 'panel-generation-v1', sourceOwnerId: 'panel',
    sourcePolygon: [{ x: 0, y: 0 }, { x: 320, y: 0 }, { x: 320, y: 180 }, { x: 0, y: 180 }],
    fragmentCount: 16, seed: 20261118,
  })
  const material = { densityKgPerSquareMeter: 8, friction: .2, restitution: .1, airFriction: 0 }
  const sourceBody: RigidBodyAuthoring = {
    layerId: 'panel', motionType: 'dynamic', collider: 'rectangle', material,
    initialVelocityPxPerSecond: { x: 120, y: 30 }, initialAngularVelocityDegPerSecond: 45,
  }
  const floorBody: RigidBodyAuthoring = {
    layerId: 'floor', motionType: 'static', collider: 'rectangle', material,
    initialVelocityPxPerSecond: { x: 0, y: 0 }, initialAngularVelocityDegPerSecond: 0,
  }
  const recipe = new FractureRigidRecipeCompiler().compile(scene, {
    generation, timelineId: 'main', startTimeMs: 0, durationMs: 2000, fractureTimeMs: 1000,
    stepHz: 120, sampleFps: 30, pixelsPerMeter: 100,
    gravityMetersPerSecondSquared: { x: 0, y: 0 }, sourceBody, staticBodies: [floorBody],
  })
  return { scene, panel, floor, generation, recipe }
}

function weightedCentroid(
  fixture: ReturnType<typeof fractureFixture>,
  preview: Awaited<ReturnType<RigidBodyBakeAdapter['prepare']>>,
  sampleIndex: number,
): { x: number; y: number } {
  let area = 0, x = 0, y = 0
  fixture.generation.fragments.forEach(fragment => {
    const pose = preview.clip.poseAt(`rigid:${fragment.id}`, sampleIndex)
    area += fragment.areaPx2
    x += pose.centerX * fragment.areaPx2
    y += pose.centerY * fragment.areaPx2
  })
  return { x: x / area, y: y / area }
}

function worldPoint(layer: Layer, point: { x: number; y: number }): { x: number; y: number } {
  const transform = layer.transform
  const radians = transform.rotationDeg * Math.PI / 180
  const localX = (point.x - transform.anchorX) * transform.scaleX
  const localY = (point.y - transform.anchorY) * transform.scaleY
  return {
    x: transform.x + transform.anchorX + Math.cos(radians) * localX - Math.sin(radians) * localY,
    y: transform.y + transform.anchorY + Math.sin(radians) * localX + Math.cos(radians) * localY,
  }
}
