import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { rigidBakeFixture } from '@/lib/bake/__tests__/RigidBodyBakeFixture'
import { newImageLayer, newSplineLayerFromData } from '@/lib/defaults'
import { StructuredGridMesh2DGenerator } from '@/lib/geometry/mesh2d'
import { createRectangleSpline } from '@/lib/spline/primitives/createRectangleSpline'
import type { PhysicsBakeController } from './usePhysicsBakeController'
import PhysicsSimulationsPanel, {
  reconcilePhysicsDraftWithScene,
  type PhysicsDraft,
} from './PhysicsSimulationsPanel'
import FractureAuthoringSection from './FractureAuthoringSection'
import { DEFAULT_PHYSICS_VIEWPORT_OVERLAY_SETTINGS } from './PhysicsViewportOverlayState'

const controller: PhysicsBakeController = {
  snapshot: null,
  descriptor: null,
  start() {},
  startRebake() {},
  cancel() {},
  discard() {},
  checkSource: () => true,
  inspectBake() { throw new Error('No bake fixture') },
  clearBake() {},
  commit: async () => {},
}

describe('PhysicsSimulationsPanel', () => {
  it('exposes the rigid/fracture/particle workflow and explicit bake actions', () => {
    const { scene } = rigidBakeFixture()
    const html = renderToStaticMarkup(createElement(PhysicsSimulationsPanel, {
      scene,
      selectedLayerId: 'box',
      selectedTimelineId: 'main',
      controller,
      onOpenParticles() {},
      viewportOverlay: DEFAULT_PHYSICS_VIEWPORT_OVERLAY_SETTINGS,
      onViewportOverlayChange() {},
    }))
    expect(html).toContain('Physics Simulations')
    expect(html).toContain('Rigid')
    expect(html).toContain('Fracture')
    expect(html).toContain('Particle')
    expect(html).toContain('Dynamic source')
    expect(html).toContain('Collide with')
    expect(html).toContain('Preview')
    expect(html).toContain('Discard')
    expect(html).toContain('Apply bake')
  })

  it('offers rectangular image layers with an explicit source type label', () => {
    const { scene } = rigidBakeFixture()
    const image = { ...newImageLayer('poster', 160, 90), id: 'poster-layer', name: 'Poster Art' }
    const nextScene = {
      ...scene,
      layers: [...scene.layers, image],
      assets: [{ id: 'poster', name: 'Poster.png', type: 'image' as const, url: 'embedded:poster', width: 640, height: 360 }],
    }
    const html = renderToStaticMarkup(createElement(PhysicsSimulationsPanel, {
      scene: nextScene,
      selectedLayerId: image.id,
      selectedTimelineId: 'main',
      controller,
      onOpenParticles() {},
      viewportOverlay: DEFAULT_PHYSICS_VIEWPORT_OVERLAY_SETTINGS,
      onViewportOverlayChange() {},
    }))

    expect(html).toContain('Poster Art · Image · poster-layer')
    expect(html).toContain('shape rect')
  })

  it('repairs stale source, collider and timeline ids after project replacement', () => {
    const { scene } = rigidBakeFixture()
    const image = { ...newImageLayer('poster', 300, 180), id: 'fresh-image', name: 'Fresh image' }
    const floor = { ...scene.layers.find(layer => layer.id === 'floor')!, id: 'fresh-floor', name: 'Fresh floor' }
    const replacement = {
      ...scene,
      layers: [image, floor],
      timelines: [{ ...scene.timelines[0], id: 'fresh-timeline', durationMs: 2400, tracks: [] }],
    }
    const stale: PhysicsDraft = {
      sourceLayerId: 'box',
      staticLayerIds: ['floor'],
      timelineId: 'main',
      startTimeMs: 500,
      durationMs: 1200,
      stepHz: 120,
      sampleFps: 30,
      pixelsPerMeter: 100,
      gravityX: 0,
      gravityY: 9.81,
      velocityX: 12,
      velocityY: 34,
      angularVelocity: 5,
      density: 2,
      friction: 0.3,
      restitution: 0.4,
      airFriction: 0.02,
      fragmentCount: 16,
      fractureTimeMs: 600,
      fractureTriggerKind: 'time',
      impactSpeedPxPerSecond: 120,
      explosionEnabled: false,
      explosionCenterX: 0,
      explosionCenterY: 0,
      explosionRadialVelocity: 180,
      explosionDirectionDeg: 270,
      explosionDirectionalVelocity: 0,
      explosionSpinVelocity: 180,
      explosionVariation: .15,
      explosionSeed: 42,
      clusterEnabled: false, bondGraphId: '', bondImpulseStrength: 40, bondDamageThreshold: 80,
      bondDamageDecayPerSecond: 0, bondRelativeNormalSpeedScale: .1,
      bondVariation: .1, bondSeed: 42, bondOverrides: [],
      bondForcedBreaks: [], bondDamageResets: [],
      seed: 99,
      generationId: 'old-generation',
    }

    const reconciled = reconcilePhysicsDraftWithScene(replacement, 'fresh-timeline', stale)

    expect(reconciled).toMatchObject({
      sourceLayerId: 'fresh-image',
      staticLayerIds: [],
      timelineId: 'fresh-timeline',
      startTimeMs: 0,
      durationMs: 2400,
      fractureTimeMs: 800,
      generationId: 'fracture-fresh-image',
      velocityX: 12,
      seed: 99,
    })
    expect(reconcilePhysicsDraftWithScene(replacement, 'fresh-timeline', reconciled)).toBe(reconciled)
  })

  it('keeps convex spline sources in fracture mode while static colliders stay rectangles', () => {
    const { scene } = rigidBakeFixture()
    const spline = { ...newSplineLayerFromData(createRectangleSpline({ width: 120, height: 80 })), id: 'convex-spline' }
    const stale = draftFixture({ sourceLayerId: spline.id, staticLayerIds: ['floor', spline.id] })
    const next = reconcilePhysicsDraftWithScene(
      { ...scene, layers: [...scene.layers, spline] },
      'main',
      stale,
      'fracture',
    )

    expect(next.sourceLayerId).toBe(spline.id)
    expect(next.staticLayerIds).toEqual(['floor'])
  })

  it('progressively discloses impact recovery and explicit explosion energy controls', () => {
    const { scene, box } = rigidBakeFixture()
    const impact = draftFixture({
      sourceLayerId: box.id,
      staticLayerIds: [],
      fractureTriggerKind: 'impact',
      explosionEnabled: true,
    })
    const html = renderToStaticMarkup(createElement(FractureAuthoringSection, {
      scene,
      source: box,
      draft: impact,
      onChange() {},
    }))

    expect(html).toContain('Minimum impact speed')
    expect(html).not.toContain('Fracture time')
    expect(html).toContain('Choose at least one Collide with body')
    expect(html).toContain('External energy enabled')
    expect(html).toContain('Radial velocity')
    expect(html).toContain('Explosion seed')
  })

  it('explains closed spline region and compound collider support', () => {
    const { scene } = rigidBakeFixture()
    const spline = { ...newSplineLayerFromData(createRectangleSpline({ width: 120, height: 80 })), id: 'convex-spline' }
    const html = renderToStaticMarkup(createElement(FractureAuthoringSection, {
      scene: { ...scene, layers: [...scene.layers, spline] },
      source: spline,
      draft: draftFixture({ sourceLayerId: spline.id }),
      onChange() {},
    }))

    expect(html).toContain('Closed spline enabled')
    expect(html).toContain('convex sources create editable Path fragments')
    expect(html).toContain('concave or holed sources create fixed-topology Mesh2D fragments with compound colliders')
  })

  it('explains Mesh2D region clipping and the live-deformation limit', () => {
    const { scene, box } = rigidBakeFixture()
    const source = {
      ...box,
      id: 'convex-mesh',
      type: 'mesh2d' as const,
      mesh2d: new StructuredGridMesh2DGenerator().generate({ width: 120, height: 80, columns: 2, rows: 2 }),
    }
    const html = renderToStaticMarkup(createElement(FractureAuthoringSection, {
      scene: { ...scene, layers: [...scene.layers, source] },
      source,
      draft: draftFixture({ sourceLayerId: source.id }),
      onChange() {},
    }))

    expect(html).toContain('Mesh2D region enabled')
    expect(html).toContain('source triangles and authored UVs are clipped')
    expect(html).toContain('Concave outlines and holes use compound colliders')
    expect(html).toContain('live deformation must be baked first')
  })

  it('progressively discloses bonded cluster controls and conservation status', () => {
    const { scene, box } = rigidBakeFixture()
    const html = renderToStaticMarkup(createElement(FractureAuthoringSection, {
      scene,
      source: box,
      draft: draftFixture({ clusterEnabled: true }),
      onChange() {},
    }))

    expect(html).toContain('Keep fragments bonded')
    expect(html).toContain('Automatic shared-boundary cluster')
    expect(html).toContain('Impulse strength')
    expect(html).toContain('Damage threshold')
    expect(html).toContain('mass, centre and momentum are checked')
  })
})

function draftFixture(overrides: Partial<PhysicsDraft> = {}): PhysicsDraft {
  return {
    sourceLayerId: 'box', staticLayerIds: ['floor'], timelineId: 'main', startTimeMs: 0,
    durationMs: 2000, stepHz: 120, sampleFps: 30, pixelsPerMeter: 100,
    gravityX: 0, gravityY: 9.81, velocityX: 0, velocityY: 0, angularVelocity: 0,
    density: 1, friction: .2, restitution: .2, airFriction: .01,
    fragmentCount: 16, fractureTimeMs: 800, fractureTriggerKind: 'time',
    impactSpeedPxPerSecond: 120, explosionEnabled: false, explosionCenterX: 0,
    explosionCenterY: 0, explosionRadialVelocity: 180, explosionDirectionDeg: 270,
    explosionDirectionalVelocity: 0, explosionSpinVelocity: 180, explosionVariation: .15,
    explosionSeed: 42, seed: 42, generationId: 'fracture-box',
    clusterEnabled: false, bondGraphId: '', bondImpulseStrength: 40, bondDamageThreshold: 80,
    bondDamageDecayPerSecond: 0, bondRelativeNormalSpeedScale: .1,
    bondVariation: .1, bondSeed: 42, bondOverrides: [], bondForcedBreaks: [], bondDamageResets: [],
    ...overrides,
  }
}
