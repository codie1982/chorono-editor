import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
import type { ChronoScene, Layer, Transform } from '@/lib/types'
import { type OverrideMap } from '@/lib/evaluator'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { createLayerWorldMatrixResolver } from '@/lib/geometry/resolveLayerWorldMatrix'
import { resolveDisplayTransform } from '@/lib/render/resolveDisplayTransform'
import { LayerIndex } from '@/lib/scene/LayerIndex'
import { resolveSelectionRoots } from '@/lib/selection/selectionRoots'
import { wrapAngle180, type Point } from './rotateMath'

export interface PreparedTransformTarget {
  readonly id: string
  /** Borrowed source layer from the immutable gesture-start scene. */
  readonly originalLayer: Layer
  /** Evaluated parent-local TRS; the authored local anchor remains unchanged. */
  readonly transform: Readonly<Transform>
  readonly parentWorld: Matrix2D
  readonly worldToParent: Matrix2D
  readonly worldMatrix: Matrix2D
  readonly worldPivot: Readonly<Point>
}

export interface TransformPreparationOptions {
  /** Center of root world-pivot bounds, or the active root's actual pivot. */
  pivotMode?: 'selectionCenter' | 'active'
  activeId?: string
}

export interface TransformDiagnostic { ok: false; reason: string; layerId?: string }
export type TransformPreparation = TransformDiagnostic | {
  ok: true; targets: PreparedTransformTarget[]; pivot: Point
}
/** Complete evaluated pose. Commit adapters must diff against the matching
 * target.transform and patch only those channels onto originalLayer.transform;
 * copying this entire pose into source would stamp unrelated animation values. */
export interface TransformChange { id: string; originalLayer: Layer; transform: Transform }
export type TransformEditResult = TransformDiagnostic | { ok: true; changes: TransformChange[] }

/** Return a diagnostic instead of partially preparing/applying a selection. */
function failure(reason: string, layerId?: string): TransformDiagnostic {
  return { ok: false, reason, ...(layerId ? { layerId } : {}) }
}

/** Compose Chorono's parent-local T(position + anchor) R S T(-anchor). */
function transformMatrix(transform: Readonly<Transform>): Matrix2D {
  return Matrix2D.translation(transform.x + transform.anchorX, transform.y + transform.anchorY)
    .rotate(transform.rotationDeg).scale(transform.scaleX, transform.scaleY)
    .translate(-transform.anchorX, -transform.anchorY)
}

/** Identify target-owned drivers whose rendered output cannot safely become a
 * new TRS input. Animated parents remain valid: only the edited root is tested. */
function hasTransformDriver(scene: ChronoScene, layer: Layer): boolean {
  const transformPath = (path: string | undefined) => path?.startsWith('transform.')
  return !!(layer.followPath || layer.motionPath
    || Object.keys(layer.propertyExpressions?.fields ?? {}).some(transformPath)
    || Object.keys(layer.paramBindings ?? {}).some(transformPath)
    || scene.bindings.some(binding => binding.target.type === 'layerProperty'
      && binding.target.layerId === layer.id && transformPath(binding.target.property))
    || scene.parameterWires?.some(wire => wire.enabled && wire.target.layerId === layer.id
      && transformPath(wire.target.propertyPath))
    || scene.timelines.some(timeline => timeline.tracks.some(track =>
      track.target.startsWith(`layers.${layer.id}.transform.`) && (
        (track.controller && track.controller.type !== 'keyframe') || track.easeCurve || track.timeWarp
        || track.multiplierCurve || track.modifiers?.some(modifier => modifier.enabled)
        || track.keyframes.some(key => key.segmentModifiers?.some(modifier => modifier.enabled))
      ))))
}

/**
 * Capture one immutable frame for a viewport transform gesture. Existing IDs
 * are resolved in authored scene order; selected descendants are removed so a
 * hierarchy receives one world delta. A selected child alone remains a target.
 * Missing/cyclic/deep hierarchies, inherited locks/freeze, singular parents and
 * target-owned signal drivers return an all-or-none diagnostic. Ordinary keys
 * and evaluated/animated parent transforms are supported. No source is mutated.
 *
 * `timeMs` is composition time in ms; supplied overrides must describe that
 * same scene/frame. Returned matrices/points use composition pixels. A single
 * target uses its actual pivot. Selection center means the bounding-box center
 * of ROOT PIVOTS, not geometry bounds or all selected descendants. Active mode
 * uses the selected root containing activeId. Original layers are borrowed;
 * copied transforms are frozen. Discard snapshots when time/source/scope changes.
 */
export function prepareTransformTargets(
  scene: ChronoScene, selectedIds: readonly string[] | ReadonlySet<string>, timeMs: number,
  overrides?: OverrideMap, options: TransformPreparationOptions = {},
): TransformPreparation {
  if (!Number.isFinite(timeMs) || timeMs < 0) return failure('Transform time must be a non-negative finite number.')
  const selected = new Set(selectedIds), index = new LayerIndex(scene.layers)
  if (!selected.size) return failure('Select one or more layers to transform.')
  const selection = resolveSelectionRoots(scene.layers, selected, index)
  if (!selection.ok) return selection
  const { roots, ancestors } = selection
  const frame = overrides ?? evaluateSceneFrame(scene, timeMs).overrides
  const worldFor = createLayerWorldMatrixResolver(scene, timeMs, frame, index)
  const targets: PreparedTransformTarget[] = []
  for (const layer of roots) {
    if ([layer, ...ancestors.get(layer.id)!].some(item => item.locked || item.frozen)) {
      return failure('Unlock and unfreeze the layer and its parents before transforming.', layer.id)
    }
    if (hasTransformDriver(scene, layer)) return failure('Bake or convert the transform driver before editing its rendered pose.', layer.id)
    const parent = layer.parentId ? index.get(layer.parentId) : undefined
    const parentWorld = parent ? worldFor(parent) : Matrix2D.identity()
    if (parentWorld.toArray().some(value => !Number.isFinite(value)) || Math.abs(parentWorld.determinant()) < 1e-9) {
      return failure('The parent transform is singular or non-finite.', layer.id)
    }
    const transform = Object.freeze({ ...layer.transform, ...resolveDisplayTransform(layer, scene, timeMs, frame, undefined, index) })
    if (Object.values(transform).some(value => !Number.isFinite(value))) return failure('The displayed transform is non-finite.', layer.id)
    const worldMatrix = parentWorld.multiply(transformMatrix(transform))
    const worldPivot = Object.freeze(parentWorld.applyToPoint({ x: transform.x + transform.anchorX, y: transform.y + transform.anchorY }))
    targets.push({ id: layer.id, originalLayer: layer, transform, parentWorld, worldToParent: parentWorld.invert(), worldMatrix, worldPivot })
  }
  const active = options.activeId && targets.find(target => target.id === options.activeId
    || ancestors.get(options.activeId!)?.some(parent => parent.id === target.id))
  const pivots = targets.map(target => target.worldPivot)
  const pivot = options.pivotMode === 'active' && active ? { ...active.worldPivot } : {
    x: (Math.min(...pivots.map(point => point.x)) + Math.max(...pivots.map(point => point.x))) / 2,
    y: (Math.min(...pivots.map(point => point.y)) + Math.max(...pivots.map(point => point.y))) / 2,
  }
  return { ok: true, targets, pivot }
}

/** Move all captured roots by a composition-pixel vector. The inverse parent
 * linear map converts each delta; original rotation/scale signs are preserved.
 * Results are fresh transforms, not applied scenes; callers own undo/auto-key. */
export function translateTransformTargets(targets: readonly PreparedTransformTarget[], deltaWorld: Point): TransformEditResult {
  if (![deltaWorld.x, deltaWorld.y].every(Number.isFinite)) return failure('Translation must be finite.')
  const changes: TransformChange[] = []
  for (const target of targets) {
    const delta = target.worldToParent.applyToVector(deltaWorld)
    const x = target.transform.x + delta.x, y = target.transform.y + delta.y
    if (![x, y].every(Number.isFinite)) return failure('Translation produces a non-finite transform.', target.id)
    changes.push({ id: target.id, originalLayer: target.originalLayer, transform: { ...target.transform, x, y } })
  }
  return { ok: true, changes }
}

/** Convert a parent-local affine result back to the layer's fixed-anchor TRS.
 * Matrix2D owns decomposition. Recomposition rejects shear with relative 1e-7
 * tolerance (1e-7 absolute near unit scale); determinant <1e-9 is singular.
 * Choose the equivalent reflection/angle representation nearest the baseline
 * so negative scaleX and authored winding do not jump to an unrelated channel. */
function matrixTransform(matrix: Matrix2D, previous: Readonly<Transform>): Transform | null {
  if (matrix.toArray().some(value => !Number.isFinite(value)) || Math.abs(matrix.determinant()) < 1e-9) return null
  const parts = matrix.decompose()
  const flip = previous.scaleX < 0 ? -1 : 1
  const scaleX = parts.scaleX * flip, scaleY = parts.scaleY * flip
  const rotationDeg = previous.rotationDeg + wrapAngle180(parts.rotation + (flip < 0 ? 180 : 0) - previous.rotationDeg)
  const linear = Matrix2D.rotation(rotationDeg).scale(scaleX, scaleY)
  const tolerance = 1e-7 * Math.max(1, Math.abs(matrix.a), Math.abs(matrix.b), Math.abs(matrix.c), Math.abs(matrix.d))
  if (Math.max(Math.abs(matrix.a - linear.a), Math.abs(matrix.b - linear.b), Math.abs(matrix.c - linear.c), Math.abs(matrix.d - linear.d)) > tolerance) return null
  const anchor = linear.applyToVector({ x: previous.anchorX, y: previous.anchorY })
  const result = { ...previous, x: matrix.e - previous.anchorX + anchor.x, y: matrix.f - previous.anchorY + anchor.y, rotationDeg, scaleX, scaleY }
  // Preserve channels affected only by matrix roundoff, so a rotation about
  // the actual anchor does not accidentally author position/scale keys.
  for (const field of ['x', 'y', 'rotationDeg', 'scaleX', 'scaleY'] as const) {
    if (Math.abs(result[field] - previous[field]) <= Number.EPSILON * 64 * Math.max(1, Math.abs(result[field]), Math.abs(previous[field]))) {
      result[field] = previous[field]
    }
  }
  return result
}

/** Apply one world affine to captured roots; never return a partly transformed
 * selection. Parent inverses are fixed at gesture start, not preview-dependent. */
function applyWorldTransform(targets: readonly PreparedTransformTarget[], world: Matrix2D): TransformEditResult {
  const changes: TransformChange[] = []
  for (const target of targets) {
    const transform = matrixTransform(target.worldToParent.multiply(world).multiply(target.worldMatrix), target.transform)
    if (!transform) return failure('This world transform requires shear or a singular TRS that the layer cannot represent.', target.id)
    changes.push({ id: target.id, originalLayer: target.originalLayer, transform })
  }
  return { ok: true, changes }
}

/** Rotate composition axes by delta degrees around the common world pivot.
 * This is a world rotation, unlike single-object parent-axis pointer rotation.
 * Nonuniform parents may require unsupported shear and return a diagnostic. */
export function rotateTransformTargets(targets: readonly PreparedTransformTarget[], pivotWorld: Point, deltaDeg: number): TransformEditResult {
  if (![pivotWorld.x, pivotWorld.y, deltaDeg].every(Number.isFinite)) return failure('Rotation and pivot must be finite.')
  if (deltaDeg === 0) return { ok: true, changes: targets.map(target => ({ id: target.id, originalLayer: target.originalLayer, transform: { ...target.transform } })) }
  return applyWorldTransform(targets, Matrix2D.translation(pivotWorld.x, pivotWorld.y).rotate(deltaDeg).translate(-pivotWorld.x, -pivotWorld.y))
}

/** Scale composition axes about a common world pivot. Signed nonzero factors
 * support reflection; callers choose sensitivity/snapping. Rotated/nonuniform
 * combinations requiring shear fail explicitly; no approximate pose is written. */
export function scaleTransformTargets(targets: readonly PreparedTransformTarget[], pivotWorld: Point, factorX: number, factorY: number): TransformEditResult {
  if (![pivotWorld.x, pivotWorld.y, factorX, factorY].every(Number.isFinite) || factorX === 0 || factorY === 0) return failure('Scale factors must be finite and nonzero; pivot must be finite.')
  if (factorX === 1 && factorY === 1) return { ok: true, changes: targets.map(target => ({ id: target.id, originalLayer: target.originalLayer, transform: { ...target.transform } })) }
  return applyWorldTransform(targets, Matrix2D.translation(pivotWorld.x, pivotWorld.y).scale(factorX, factorY).translate(-pivotWorld.x, -pivotWorld.y))
}
