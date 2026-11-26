import { rebaseShoulderLimit } from '../../rig2d/jointLimits'
import type { ChronoScene, Layer } from '../../types'
import type { Matrix2D } from '../../geometry/Matrix2D'
import { isVec2 } from '../../geometry/CoordinateSystem'
import { assertStaticTransform } from './WorldPlacement'

/** Transport a complete sibling rig from the removed group's local pixels into
 * its parent's pixels. A static translation, rotation and positive uniform
 * scale preserve pivot offsets and IK geometry. The lower-local tip and bend
 * stay unchanged. Cross-boundary references and unsupported drivers or scales
 * fail before any source edits. Identity placement leaves child animation intact. */
export function prepareUngroupPivotLinks(scene: ChronoScene, group: Layer, matrix: Matrix2D, identity: boolean) {
  const children = new Set(scene.layers.filter(layer => layer.parentId === group.id).map(layer => layer.id))
  const joints = new Set<string>()
  for (const layer of scene.layers) {
    const link = layer.pivotLink2d
    const ik = layer.twoBoneIK2d
    if (!link && !ik) continue
    const refs = [...(link ? [link.driverId] : []), ...(ik ? [ik.lowerId, ik.targetId] : [])]
    const moves = children.has(layer.id)
    if (layer.id === group.id || refs.includes(group.id) || refs.some(id => children.has(id) !== moves))
      throw new Error('Keep all linked pivots and IK targets in the same group, or remove their links before ungrouping.')
    if (moves) {
      joints.add(layer.id)
      refs.forEach(id => joints.add(id))
    }
  }

  const patches = new Map<string, Pick<Layer, 'transform' | 'pivotLink2d' | 'twoBoneIK2d'>>()
  if (!joints.size) return patches
  try {
    assertStaticTransform(scene, identity ? [group.id] : [group.id, ...Array.from(joints)], 'rebase-pivot-links')
  } catch {
    throw new Error('Bake animated group and joint transforms before ungrouping pivot links or IK.')
  }
  if (identity) return patches

  const { rotationDeg, scaleX, scaleY } = group.transform
  if (scaleX !== scaleY || scaleX <= 0 || matrix.determinant() < 1e-9 || !matrix.toArray().every(Number.isFinite))
    throw new Error('Ungrouping pivot links or IK requires a positive uniform group scale.')

  for (const layer of scene.layers) {
    if (!joints.has(layer.id)) continue
    const { transform, pivotLink2d } = layer
    const pivot = matrix.applyToPoint({ x: transform.x + transform.anchorX, y: transform.y + transform.anchorY })
    // Keep signed local scales and rotation: matrix decomposition can swap a mirror into the other axis.
    const next = { ...transform, x: pivot.x - transform.anchorX, y: pivot.y - transform.anchorY,
      rotationDeg: transform.rotationDeg + rotationDeg, scaleX: transform.scaleX * scaleX, scaleY: transform.scaleY * scaleX }
    if (!Object.values(next).every(Number.isFinite)) throw new Error('Ungrouping produced a non-finite joint transform.')
    const patch: Pick<Layer, 'transform' | 'pivotLink2d' | 'twoBoneIK2d'> = { transform: next }
    if (pivotLink2d) {
      if (!isVec2(pivotLink2d.bindPivot)) throw new Error('Repair the invalid pivot binding before ungrouping.')
      const bindPivot = matrix.applyToPoint(pivotLink2d.bindPivot)
      const bindRotationDeg = pivotLink2d.bindRotationDeg + rotationDeg
      if (!isVec2(bindPivot) || !Number.isFinite(bindRotationDeg)) throw new Error('Ungrouping produced a non-finite pivot binding.')
      patch.pivotLink2d = { ...pivotLink2d, bindPivot, bindRotationDeg }
    }
    // An undriven shoulder used the removed group's axes. A pivot driver's axes
    // rotate with the group, so its relative limits need no rebase.
    const ik = layer.twoBoneIK2d, limit = ik?.shoulderLimit
    if (!pivotLink2d && ik && limit && rotationDeg) {
      patch.twoBoneIK2d = rebaseShoulderLimit(ik, rotationDeg)
    }
    patches.set(layer.id, patch)
  }
  return patches
}
