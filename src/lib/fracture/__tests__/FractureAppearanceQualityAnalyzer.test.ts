import { describe, expect, it } from 'vitest'
import { emptyScene, newImageLayer } from '@/lib/defaults'
import { createRigidBakeRecord } from '@/lib/physics/RigidBakeOwnership'
import { PhysicsBakeRecipeFactory } from '@/lib/physics/PhysicsBakeRecipeFactory'
import type { ChronoScene, Layer } from '@/lib/types'
import { FractureAppearanceQualityAnalyzer } from '../FractureAppearanceQualityAnalyzer'
import { FractureLayerFactory } from '../FractureLayerFactory'

describe('FractureAppearanceQualityAnalyzer', () => {
  it('reports aligned image geometry, shared seams and the mask-free budget', () => {
    const fixture = qualityFixture()
    const result = new FractureAppearanceQualityAnalyzer().analyze(fixture.scene, fixture.recordId)

    expect(result.status).toBe('pass')
    if (result.status !== 'pass') throw new Error('Expected an available pass report')
    expect(result).toMatchObject({
      appearanceKind: 'image',
      eventTimeMs: 800,
      fragmentCount: 6,
      maskedFragmentCount: 0,
      estimatedCurrentMaskScratchPeakBytes: 0,
      fullFrameMaskAlternativePeakBytes: 800 * 450 * 4 * 4,
    })
    expect(result.triangleCount).toBeGreaterThan(0)
    expect(result.sharedEdgeCount).toBeGreaterThan(0)
    expect(result.sharedBoundaryLengthPx).toBeGreaterThan(0)
    expect(result.maxEventAlignmentGapPx).toBeCloseTo(0, 10)
    expect(result.meanEventAlignmentGapPx).toBeCloseTo(0, 10)
    expect(result.eventAreaDeltaPercent).toBeCloseTo(0, 10)
  })

  it('warns when one generated fragment drifts at the topology event', () => {
    const fixture = qualityFixture()
    const fragmentId = fixture.fragmentIds[0]
    const drifted: ChronoScene = {
      ...fixture.scene,
      layers: fixture.scene.layers.map(layer => layer.id === fragmentId
        ? { ...layer, transform: { ...layer.transform, x: layer.transform.x + 0.25 } }
        : layer),
    }

    const result = new FractureAppearanceQualityAnalyzer().analyze(drifted, fixture.recordId)

    expect(result.status).toBe('warning')
    if (result.status !== 'warning') throw new Error('Expected an available warning report')
    expect(result.maxEventAlignmentGapPx).toBeCloseTo(0.25, 10)
    expect(result.eventAreaDeltaPercent).toBeCloseTo(0, 10)
  })

  it('estimates the existing full-frame pipeline when a fragment uses a mask', () => {
    const fixture = qualityFixture()
    const fragmentId = fixture.fragmentIds[0]
    const masked: ChronoScene = {
      ...fixture.scene,
      layers: fixture.scene.layers.map(layer => layer.id === fragmentId ? {
        ...layer,
        masks: [{ id: 'quality-mask', maskLayerId: fixture.sourceId, mode: 'add' }],
      } : layer),
    }

    const result = new FractureAppearanceQualityAnalyzer().analyze(masked, fixture.recordId)

    expect(result.status).toBe('pass')
    if (result.status !== 'pass') throw new Error('Expected an available pass report')
    expect(result.maskedFragmentCount).toBe(1)
    expect(result.estimatedCurrentMaskScratchPeakBytes).toBe(800 * 450 * 4 * 4)
  })

  it('returns a recoverable unavailable result when topology is missing', () => {
    const fixture = qualityFixture()
    const missing: ChronoScene = {
      ...fixture.scene,
      physics: { ...fixture.scene.physics!, fractureGenerations: [] },
    }

    expect(new FractureAppearanceQualityAnalyzer().analyze(missing, fixture.recordId)).toEqual({
      status: 'unavailable',
      reason: 'The fracture generation manifest is missing.',
    })
  })
})

/** Build a committed, mask-free image fracture without running the solver. */
function qualityFixture(): {
  readonly scene: ChronoScene
  readonly recordId: string
  readonly sourceId: string
  readonly fragmentIds: readonly string[]
} {
  const base = emptyScene()
  const source: Layer = {
    ...newImageLayer('quality-image', 240, 140),
    id: 'quality-source',
    name: 'Quality source',
    image: { assetId: 'quality-image', objectFit: 'cover' },
    transform: { x: 210, y: 120, scaleX: 1, scaleY: 1, rotationDeg: 12, anchorX: 120, anchorY: 70 },
  }
  const authored: ChronoScene = {
    ...base,
    composition: { ...base.composition, width: 800, height: 450, durationMs: 1600, frameRate: 30 },
    assets: [{
      id: 'quality-image', name: 'Quality.png', type: 'image', url: 'embedded:quality', width: 480, height: 280,
    }],
    layers: [source],
    timelines: [{ id: 'main', durationMs: 1600, autoplay: false, loop: false, tracks: [], layerIds: [source.id] }],
  }
  const prepared = new PhysicsBakeRecipeFactory().compileVoronoi(authored, {
    sourceLayerId: source.id,
    timelineId: 'main',
    durationMs: 1600,
    fractureTimeMs: 800,
    fragmentCount: 6,
    seed: 20261121,
    generationId: 'quality-generation',
    gravity: { x: 0, y: 0 },
  })
  const fragments = new FractureLayerFactory().create(authored, prepared.generation, prepared.recipe)
  const recordId = 'quality-fracture-bake'
  const record = createRigidBakeRecord({
    id: recordId,
    recipe: prepared.recipe,
    sampleCount: 49,
    tracks: [],
    generatedLayers: fragments,
    generation: prepared.generation,
  })
  return {
    recordId,
    sourceId: source.id,
    fragmentIds: fragments.map(layer => layer.id),
    scene: {
      ...authored,
      layers: [...authored.layers, ...fragments],
      timelines: authored.timelines.map(timeline => ({
        ...timeline,
        layerIds: [...(timeline.layerIds ?? []), ...fragments.map(layer => layer.id)],
      })),
      physics: { schemaVersion: 1, rigidBakes: [record], fractureGenerations: [prepared.generation] },
    },
  }
}
