import { emptyScene, newRectLayer } from '@/lib/defaults'
import { RigidBodySceneCompiler } from '@/lib/physics/RigidBodySceneCompiler'
import type { ChronoScene, Layer } from '@/lib/types'
import type { RigidBodyAuthoring, RigidBodyBakeRecipe } from '@/lib/types/physics'

const material = { densityKgPerSquareMeter: 8, friction: .2, restitution: 0, airFriction: .01 }

function authored(layerId: string, motionType: 'dynamic' | 'static'): RigidBodyAuthoring {
  return { layerId, motionType, collider: 'rectangle', material,
    initialVelocityPxPerSecond: { x: 0, y: 0 }, initialAngularVelocityDegPerSecond: 0 }
}

/** Shared deterministic falling-box scene for adapter and commit tests. */
export function rigidBakeFixture(): { scene: ChronoScene; box: Layer; floor: Layer; recipe: RigidBodyBakeRecipe } {
  const box = { ...newRectLayer(), id: 'box', size: { width: 100, height: 100 },
    transform: { x: 400, y: 50, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 50, anchorY: 50 } }
  const floor = { ...newRectLayer(), id: 'floor', size: { width: 800, height: 40 },
    transform: { x: 50, y: 400, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 400, anchorY: 20 } }
  const base = emptyScene()
  const scene = { ...base, composition: { ...base.composition, width: 900, height: 500, durationMs: 3000, frameRate: 30 },
    layers: [box, floor], timelines: [{ id: 'main', durationMs: 3000, autoplay: false, loop: false, tracks: [], layerIds: [] }] }
  const recipe = new RigidBodySceneCompiler().compile(scene, {
    timelineId: 'main', startTimeMs: 0, durationMs: 3000, stepHz: 120, sampleFps: 30,
    pixelsPerMeter: 100, gravityMetersPerSecondSquared: { x: 0, y: 9.81 },
    bodies: [authored('box', 'dynamic'), authored('floor', 'static')],
  })
  return { scene, box, floor, recipe }
}
