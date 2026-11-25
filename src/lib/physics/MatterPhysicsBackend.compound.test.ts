import { describe, expect, it } from 'vitest'
import type { RigidBodyBakeRecipe, RigidBodySnapshot } from '@/lib/types/physics'
import { MatterPhysicsBackend } from './MatterPhysicsBackend'

describe('MatterPhysicsBackend compound collider', () => {
  it('activates a fracture fragment from multiple convex parts', () => {
    const backend = new MatterPhysicsBackend()
    const source = body('source', 'rectangle')
    const fragment: RigidBodySnapshot = {
      ...body('fragment', 'compoundPolygon'),
      colliderPartsPx: [
        [{ x: -20, y: -10 }, { x: 0, y: -10 }, { x: 0, y: 10 }, { x: -20, y: 10 }],
        [{ x: 0, y: -10 }, { x: 20, y: -10 }, { x: 20, y: 10 }, { x: 0, y: 10 }],
      ],
      activation: {
        kind: 'fractureFragment',
        eventId: 'fracture-event',
        sourceBodyId: source.bodyId,
        sourceLocalOffsetPx: { x: 0, y: 0 },
      },
    }
    const recipe: RigidBodyBakeRecipe = {
      version: 1,
      kind: 'rigidPose',
      source: { kind: 'rigidScene', ownerId: 'timeline', revision: '0000000000000000' },
      recipeHash: '0000000000000000',
      timelineId: 'timeline',
      startTimeMs: 0,
      durationMs: 1000,
      stepHz: 60,
      sampleFps: 30,
      pixelsPerMeter: 100,
      gravityMetersPerSecondSquared: { x: 0, y: 0 },
      solverId: 'matter-js',
      solverVersion: '0.20.0',
      bodies: [source, fragment],
      fractureEvents: [{
        id: 'fracture-event',
        timeMs: 1000 / 60,
        tick: 1,
        sourceBodyId: source.bodyId,
        fragmentBodyIds: [fragment.bodyId],
        trigger: { kind: 'time' },
      }],
    }

    backend.initialize(recipe)
    backend.step(1000 / 60)
    expect(backend.readPose(fragment.bodyId)).toMatchObject({ centerX: 100, centerY: 100, angleDeg: 0 })
    backend.dispose()
  })
})

function body(id: string, collider: RigidBodySnapshot['collider']): RigidBodySnapshot {
  return {
    layerId: id,
    bodyId: `rigid:${id}`,
    motionType: 'dynamic',
    collider,
    material: { densityKgPerSquareMeter: 1, friction: 0.1, restitution: 0, airFriction: 0 },
    initialVelocityPxPerSecond: { x: 0, y: 0 },
    initialAngularVelocityDegPerSecond: 0,
    centerPx: { x: 100, y: 100 },
    angleDeg: 0,
    widthPx: 40,
    heightPx: 20,
    visual: { widthPx: 40, heightPx: 20, anchorX: 20, anchorY: 10, uniformScale: 1 },
  }
}
