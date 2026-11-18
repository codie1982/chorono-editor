import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import type { ChronoScene, Layer } from '@/lib/types'
import type { RigidBodyAuthoring } from '@/lib/types/physics'
import { RigidBodySceneCompiler } from '../RigidBodySceneCompiler'
import { rigidCenterFromVisual, visualTransformFromRigidPose } from '../RigidVisualTransform'

const material = { densityKgPerSquareMeter: 8, friction: .2, restitution: .1, airFriction: .01 }

function body(layerId: string, motionType: 'dynamic' | 'static'): RigidBodyAuthoring {
  return { layerId, motionType, collider: 'rectangle', material,
    initialVelocityPxPerSecond: { x: 0, y: 0 }, initialAngularVelocityDegPerSecond: 0 }
}

function fixture(): { scene: ChronoScene; box: Layer; floor: Layer } {
  const box = { ...newRectLayer(), id: 'box', size: { width: 100, height: 80 },
    transform: { x: 120, y: 90, scaleX: 1, scaleY: 1, rotationDeg: 25, anchorX: 20, anchorY: 30 } }
  const floor = { ...newRectLayer(), id: 'floor', size: { width: 600, height: 40 },
    transform: { x: 20, y: 400, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 300, anchorY: 20 } }
  const scene = { ...emptyScene(), composition: { ...emptyScene().composition, durationMs: 3000 }, layers: [box, floor],
    timelines: [{ id: 'main', durationMs: 3000, autoplay: false, loop: false, tracks: [], layerIds: [] }] }
  return { scene, box, floor }
}

describe('RigidBodySceneCompiler', () => {
  it('preserves an off-centre visual pivot through centre-of-mass conversion', () => {
    const { scene, box } = fixture()
    const recipe = new RigidBodySceneCompiler().compile(scene, {
      timelineId: 'main', startTimeMs: 0, durationMs: 3000, bodies: [body('box', 'dynamic'), body('floor', 'static')],
    })
    const snapshot = recipe.bodies[0]
    const expected = rigidCenterFromVisual({ x: box.transform.x, y: box.transform.y,
      angleDeg: box.transform.rotationDeg, widthPx: box.size!.width, heightPx: box.size!.height,
      anchorX: box.transform.anchorX, anchorY: box.transform.anchorY, uniformScale: box.transform.scaleX })
    expect(snapshot.centerPx).toEqual(expected)
    const restored = visualTransformFromRigidPose(snapshot, {
      centerX: snapshot.centerPx.x, centerY: snapshot.centerPx.y, angleDeg: snapshot.angleDeg,
    })
    expect(restored.x).toBeCloseTo(box.transform.x, 12)
    expect(restored.y).toBeCloseTo(box.transform.y, 12)
    expect(restored.rotationDeg).toBe(box.transform.rotationDeg)
    expect(recipe.source.revision).toHaveLength(16)
    expect(new RigidBodySceneCompiler().isCurrent(recipe, scene)).toBe(true)
  })

  it('rejects hierarchy, non-uniform scale and competing transform writers', () => {
    const { scene } = fixture(), compiler = new RigidBodySceneCompiler()
    const input = { timelineId: 'main', startTimeMs: 0, durationMs: 3000,
      bodies: [body('box', 'dynamic'), body('floor', 'static')] }
    const parented = { ...scene, layers: scene.layers.map(layer => layer.id === 'box' ? { ...layer, parentId: 'floor' } : layer) }
    expect(() => compiler.compile(parented, input)).toThrow(/hierarchy/)
    const scaled = { ...scene, layers: scene.layers.map(layer => layer.id === 'box'
      ? { ...layer, transform: { ...layer.transform, scaleY: 2 } } : layer) }
    expect(() => compiler.compile(scaled, input)).toThrow(/uniform/)
    const animated = { ...scene, timelines: [{ ...scene.timelines[0], tracks: [{
      target: 'layers.box.transform.x', keyframes: [{ id: 'human', timeMs: 0, value: 1, easing: { type: 'linear' as const } }],
    }] }] }
    expect(() => compiler.compile(animated, input)).toThrow(/already animated/)
  })
})
