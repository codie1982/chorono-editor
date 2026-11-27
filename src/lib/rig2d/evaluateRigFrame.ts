import type { ChronoScene } from '../types'
import type { OverrideMap } from '../evaluator'
import { distance } from '../geometry/CoordinateSystem'
import { createEvaluatedWorldMatrixResolver } from '../geometry/evaluatedWorldMatrix'
import type { Matrix2D } from '../geometry/Matrix2D'
import { LayerIndex } from '../scene/LayerIndex'
import { applyPivotLinks } from './frame'
import { EMPTY_IK_DIAGNOSTICS, type IKDiagnostic, type IKDiagnostics, type IKMeasurement, type LocalIKDiagnostic } from './diagnostics'

/** Map the solved chain through its parent. Anisotropic scale requires measuring
 * the projected endpoints in composition pixels, independent of viewport zoom. */
function project(local: IKMeasurement, parent: Matrix2D): IKMeasurement {
  const tip = parent.applyToPoint(local.tip), target = parent.applyToPoint(local.target)
  return { shoulder: parent.applyToPoint(local.shoulder), elbow: parent.applyToPoint(local.elbow),
    tip, target, distance: distance(tip, target) }
}

/** Evaluate constraints once from pre-rig overrides. Project diagnostics after
 * every link has settled, since an ancestor can itself be driven by another rig.
 * All results belong to this frame. A rig-free scene borrows its original map. */
export function evaluateRigFrame(scene: ChronoScene, timeMs: number, base: OverrideMap):
  { overrides: OverrideMap; ikDiagnostics: IKDiagnostics } {
  let measurements: Map<string, LocalIKDiagnostic> | undefined
  let index: LayerIndex | undefined
  let baseMatrix: ReturnType<typeof createEvaluatedWorldMatrixResolver> | undefined
  const overrides = applyPivotLinks(scene.layers, base, (owner, state) => {
    (measurements ??= new Map()).set(owner.id, state)
  }, parentId => {
    index ??= new LayerIndex(scene.layers)
    const parent = index.get(parentId)
    if (!parent) return true
    // Links change translation and rotation only. The determinant is therefore
    // already final even for a parent whose own IK has yet to run.
    baseMatrix ??= createEvaluatedWorldMatrixResolver(scene, timeMs, base, index)
    return Math.abs(baseMatrix(parent).determinant()) < 1e-9
  })
  if (!measurements) return { overrides, ikDiagnostics: EMPTY_IK_DIAGNOSTICS }
  index ??= new LayerIndex(scene.layers)
  const worldMatrix = createEvaluatedWorldMatrixResolver(scene, timeMs, overrides, index)
  const diagnostics = new Map<string, IKDiagnostic>()
  for (const [upperId, state] of Array.from(measurements)) {
    const upper = index.get(upperId)!
    const { lowerId, targetId } = upper.twoBoneIK2d!
    const ids = { upperId, lowerId, targetId }
    if (state.status === 'inactive') diagnostics.set(upperId, { ...ids, ...state })
    else {
      const parent = upper.parentId && index.get(upper.parentId)
      const parentBasis = parent ? worldMatrix(parent) : undefined
      diagnostics.set(upperId, { ...ids, ...state, parentBasis, composition: parentBasis ? project(state.local, parentBasis) : state.local })
    }
  }
  return { overrides, ikDiagnostics: diagnostics }
}
