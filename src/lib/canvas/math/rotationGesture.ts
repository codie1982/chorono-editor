import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
import type { ChronoScene, Layer } from '@/lib/types'
import { type OverrideMap } from '@/lib/evaluator'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { resolveDisplayTransform } from '@/lib/render/resolveDisplayTransform'
import { angleDegFromPivot, wrapAngle180, type Point } from './rotateMath'

export interface RotationGesture {
  /** Convert the cursor through the parent's displayed rotation/scale/reflection. */
  worldToParent: Matrix2D
  pivot: Point
  worldPivot: Point
  startAngle: number
  rotationDeg: number
}

export function resolveParentWorldMatrix(
  layer: Layer, scene: ChronoScene, timeMs: number, overrides?: OverrideMap,
): Matrix2D {
  const parent = layer.parentId ? scene.layers.find(l => l.id === layer.parentId) : undefined
  return parent ? resolveLayerWorldMatrix(parent, scene, timeMs, overrides) : Matrix2D.identity()
}

/** Snapshot the visible pivot/rotation; mouse angles live in the parent's axes. */
export function beginRotationGesture(
  layer: Layer, scene: ChronoScene, timeMs: number, pointer: Point, overrides?: OverrideMap,
): RotationGesture | null {
  const frame = overrides ?? evaluateSceneFrame(scene, timeMs).overrides
  const parentWorld = resolveParentWorldMatrix(layer, scene, timeMs, frame)
  if (Math.abs(parentWorld.determinant()) < 1e-9) return null
  const worldToParent = parentWorld.invert()
  const worldPivot = resolveLayerWorldMatrix(layer, scene, timeMs, frame).applyToPoint({
    x: layer.transform.anchorX, y: layer.transform.anchorY,
  })
  const pivot = worldToParent.applyToPoint(worldPivot)
  const localPointer = worldToParent.applyToPoint(pointer)
  return {
    worldToParent, pivot, worldPivot,
    startAngle: angleDegFromPivot(pivot.x, pivot.y, localPointer.x, localPointer.y),
    rotationDeg: resolveDisplayTransform(layer, scene, timeMs, frame).rotationDeg,
  }
}

export function rotationFromPointer(gesture: RotationGesture, pointer: Point, snap = false) {
  const p = gesture.worldToParent.applyToPoint(pointer)
  const angle = angleDegFromPivot(gesture.pivot.x, gesture.pivot.y, p.x, p.y)
  let delta = wrapAngle180(angle - gesture.startAngle)
  if (snap) delta = Math.round(delta / 15) * 15
  return { delta, rotationDeg: wrapAngle180(gesture.rotationDeg + delta) }
}
