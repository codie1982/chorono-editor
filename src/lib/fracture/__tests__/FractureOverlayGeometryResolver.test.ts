import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import type { OverrideMap } from '@/lib/evaluator'
import { FractureLayerFactory } from '@/lib/fracture/FractureLayerFactory'
import { FractureOverlayGeometryResolver } from '@/lib/fracture/FractureOverlayGeometryResolver'
import { FractureRigidRecipeCompiler } from '@/lib/fracture/FractureRigidRecipeCompiler'
import { VoronoiFractureGenerator } from '@/lib/fracture/VoronoiFractureGenerator'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import type { ChronoScene, Layer } from '@/lib/types'
import type { RigidBakeRecord, RigidBodyAuthoring } from '@/lib/types/physics'

describe('FractureOverlayGeometryResolver', () => {
  it('keeps source-phase fragments aligned and exposes exact first-slice colliders', () => {
    const fixture = overlayFixture()
    const frame = new FractureOverlayGeometryResolver().resolve(fixture.scene, fixture.record.id, 500)
    const sourceMatrix = resolveLayerWorldMatrix(fixture.panel, fixture.scene, 500)
    const first = fixture.generation.fragments[0]

    expect(frame).toMatchObject({
      recordId: fixture.record.id,
      generationId: fixture.generation.generationId,
      phase: 'source',
      eventTimeMs: 1000,
    })
    expect(frame!.fragments).toHaveLength(4)
    expect(frame!.colliderPolygons).toHaveLength(2)
    expect(frame!.fragments[0].points[0]).toEqual(sourceMatrix.applyToPoint(first.polygon[0]))
    expect(frame!.fragments[0].centroid).toEqual(sourceMatrix.applyToPoint(first.centroidPx))
    expect(frame!.fragments[0].triangleIndices).toHaveLength((first.polygon.length - 2) * 3)
  })

  it('follows generated fragment animation after the topology event', () => {
    const fixture = overlayFixture()
    const fragment = fixture.generation.fragments[0]
    const layer = fixture.scene.layers.find(item => item.id === fragment.id)!
    const baseline = new FractureOverlayGeometryResolver().resolve(fixture.scene, fixture.record.id, 1000)!
    const movedX = layer.transform.x + 37
    const overrides: OverrideMap = new Map([[`layers.${fragment.id}.transform.x`, movedX]])
    const moved = new FractureOverlayGeometryResolver().resolve(fixture.scene, fixture.record.id, 1000, overrides)!

    expect(baseline.phase).toBe('fragments')
    expect(moved.fragments[0].points[0].x - baseline.fragments[0].points[0].x).toBeCloseTo(37, 9)
    expect(moved.fragments[0].centroid.x - baseline.fragments[0].centroid.x).toBeCloseTo(37, 9)
    expect(moved.colliderPolygons).toHaveLength(5)
  })

  it('falls back to the newest compatible record and refuses missing topology', () => {
    const fixture = overlayFixture()
    expect(new FractureOverlayGeometryResolver().resolve(fixture.scene, 'missing-record', 0)?.recordId)
      .toBe(fixture.record.id)
    expect(new FractureOverlayGeometryResolver().resolve({ ...fixture.scene, physics: undefined }, null, 0)).toBeNull()
  })
})

function overlayFixture() {
  const panel: Layer = {
    ...newRectLayer(),
    id: 'overlay-panel',
    name: 'Overlay Panel',
    size: { width: 240, height: 140 },
    transform: { x: 120, y: 80, scaleX: 1, scaleY: 1, rotationDeg: 12, anchorX: 120, anchorY: 70 },
    style: { fill: { type: 'solid', color: '#3b82f6' }, cornerRadius: 0 },
    opacity: 1,
  }
  const floor: Layer = {
    ...newRectLayer(),
    id: 'overlay-floor',
    name: 'Overlay Floor',
    size: { width: 500, height: 30 },
    transform: { x: 20, y: 400, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 250, anchorY: 15 },
    style: { fill: { type: 'solid', color: '#64748b' }, cornerRadius: 0 },
  }
  const base = emptyScene()
  const sourceScene: ChronoScene = {
    ...base,
    composition: { ...base.composition, width: 640, height: 480, durationMs: 1600 },
    layers: [panel, floor],
    timelines: [{ id: 'overlay', durationMs: 1600, autoplay: false, loop: false, tracks: [], layerIds: [] }],
  }
  const generation = new VoronoiFractureGenerator().generate({
    generationId: 'overlay-generation',
    sourceOwnerId: panel.id,
    sourcePolygon: [{ x: 0, y: 0 }, { x: 240, y: 0 }, { x: 240, y: 140 }, { x: 0, y: 140 }],
    fragmentCount: 4,
    seed: 20261121,
  })
  const material = { densityKgPerSquareMeter: 1, friction: .2, restitution: .1, airFriction: .01 }
  const dynamic: RigidBodyAuthoring = {
    layerId: panel.id,
    motionType: 'dynamic',
    collider: 'rectangle',
    material,
    initialVelocityPxPerSecond: { x: 0, y: 0 },
    initialAngularVelocityDegPerSecond: 0,
  }
  const staticBody: RigidBodyAuthoring = {
    layerId: floor.id,
    motionType: 'static',
    collider: 'rectangle',
    material,
    initialVelocityPxPerSecond: { x: 0, y: 0 },
    initialAngularVelocityDegPerSecond: 0,
  }
  const recipe = new FractureRigidRecipeCompiler().compile(sourceScene, {
    generation,
    timelineId: 'overlay',
    startTimeMs: 0,
    durationMs: 1600,
    fractureTimeMs: 1000,
    stepHz: 120,
    sampleFps: 30,
    pixelsPerMeter: 100,
    gravityMetersPerSecondSquared: { x: 0, y: 9.81 },
    sourceBody: dynamic,
    staticBodies: [staticBody],
  })
  const fragmentLayers = new FractureLayerFactory().create(sourceScene, generation, recipe)
  const record: RigidBakeRecord = {
    schemaVersion: 1,
    id: 'overlay-fracture-v1',
    recipe,
    sampleCount: 49,
    tracks: [],
    generatedLayers: [],
    fractureGeneration: { generationId: generation.generationId, topologyHash: generation.topologyHash },
    timelineLayerIdsAdded: fragmentLayers.map(layer => layer.id),
  }
  const scene: ChronoScene = {
    ...sourceScene,
    layers: [...sourceScene.layers, ...fragmentLayers],
    physics: { schemaVersion: 1, rigidBakes: [record], fractureGenerations: [generation] },
  }
  return { scene, panel, floor, generation, record }
}
