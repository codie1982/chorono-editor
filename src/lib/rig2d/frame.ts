import { validLimit } from './jointLimits'
import type { LocalIKDiagnostic } from './diagnostics'
import type { Layer } from '../types'
import { getLayerValue, type OverrideMap } from '../evaluator'
import { dependencyOrder } from '../core/graph/dependencyOrder'
import { isVec2 } from '../geometry/CoordinateSystem'
import { followPivot, readJoint, solveTwoBone, type JointPose } from './pose'

/** First release uses ordinary siblings and their shared parent's axes. Path
 * motion owns a later render stage, so a path-driven pivot is ineligible. */
export function supportsPivotLink(layer: Layer): boolean {
  return layer.type !== 'audio' && !layer.instanceOf && !layer.motionPath && !layer.followPath && !layer.booleanResultFor && !layer.booleanOperation
}

/** Build an ordered constraint graph for an immutable layer list. One IK pair
 * is a single node so all followers observe both final joint poses regardless
 * of layer order. Invalid import references fall back to ordinary authored TRS. */
function planLinks(layers: readonly Layer[]) {
  const byId = new Map(layers.map(layer => [layer.id, layer]))
  const links = new Map<string, Layer>(), pairs = new Map<string, Layer>(), owners = new Map<string, string>()
  const invalid = new Set<string>()
  for (const layer of layers) {
    const link = layer.pivotLink2d
    if (!link) continue
    const driver = byId.get(link.driverId)
    if (!driver || driver.id === layer.id || driver.parentId !== layer.parentId || !supportsPivotLink(driver) || !supportsPivotLink(layer)
      || !isVec2(link.bindPivot) || !Number.isFinite(link.bindRotationDeg)) invalid.add(layer.id)
    else links.set(layer.id, driver)
  }
  for (const upper of layers) {
    const ik = upper.twoBoneIK2d
    if (!ik) continue
    const lower = byId.get(ik.lowerId), target = byId.get(ik.targetId)
    if (!lower || links.get(lower.id) !== upper || !target || target.parentId !== upper.parentId || !supportsPivotLink(target)
      || (ik.weight !== undefined && !(Number.isFinite(ik.weight) && ik.weight >= 0 && ik.weight <= 1))
      || !validLimit(ik.shoulderLimit) || !validLimit(ik.elbowLimit)
      || (ik.preferredShoulderOffsetDeg !== undefined && (!Number.isFinite(ik.preferredShoulderOffsetDeg) || Math.abs(ik.preferredShoulderOffsetDeg) > 180))
      || target === upper || target === lower || lower.twoBoneIK2d || !isVec2(ik.tip) || ![1,-1].includes(ik.bend)) invalid.add(upper.id)
    else { pairs.set(upper.id, lower); owners.set(lower.id, upper.id) }
  }
  const edges: [string, string][] = []
  const node = (id: string) => owners.get(id) ?? id
  for (const [id, driver] of Array.from(links)) if (!owners.has(id)) edges.push([node(driver.id), id])
  for (const id of Array.from(pairs.keys())) edges.push([node(byId.get(id)!.twoBoneIK2d!.targetId), id])
  const schedule = dependencyOrder(edges.flat(), edges)
  for (const id of Array.from(schedule.blocked)) invalid.add(id)
  return { byId, links, pairs, order: schedule.order, blocked: schedule.blocked, invalid }
}

type Plan = ReturnType<typeof planLinks>
const cached = new WeakMap<readonly Layer[], Plan | null>()

/** Share a dependency schedule between frames until the immutable layer array
 * changes. Layers without constraints need no graph or override-map copy. */
function linkPlan(layers: readonly Layer[]): Plan | null {
  const existing = cached.get(layers)
  if (existing !== undefined) return existing
  const plan = layers.some(layer => layer.pivotLink2d || layer.twoBoneIK2d) ? planLinks(layers) : null
  cached.set(layers, plan)
  return plan
}

/** Return a diagnostic for an imported or reparented relationship whose frame
 * constraint is dormant. The original relationship can still be removed. */
export function hasInvalidPivotLink(layers: readonly Layer[], id: string): boolean {
  return linkPlan(layers)?.invalid.has(id) ?? false
}

/** Admit an edit only when its touched joints and newly affected dependents
 * resolve. Dormant references elsewhere in an imported scene remain repairable. */
export function assertLinkPlan(layers: readonly Layer[], before: readonly Layer[], touched: ReadonlySet<string>): void {
  const invalid = linkPlan(layers)?.invalid
  if (invalid && Array.from(invalid).some(id => touched.has(id) || !hasInvalidPivotLink(before, id)))
    throw new Error('Use independent sibling pivots. Links and IK targets cannot form a cycle or share a driven joint.')
}

/** Final frame projection after timeline, binding and expression evaluation.
 * Reuses the supplied map when no links exist. The optional observer receives
 * one parent-local result per IK owner, including invalid imported chains. */
export function applyPivotLinks(layers: readonly Layer[], base: OverrideMap,
  report?: (owner: Layer, result: LocalIKDiagnostic) => void,
  singularParent?: (id: string) => boolean): OverrideMap {
  const plan = linkPlan(layers)
  if (!plan) return base
  for (const id of Array.from(plan.invalid)) {
    const owner = plan.byId.get(id)
    if (owner?.twoBoneIK2d) report?.(owner, { status: 'inactive',
      reason: plan.blocked.has(id) ? 'dependency-cycle' : 'invalid-binding' })
  }
  const result = new Map(base)
  const write = (layer: Layer, pose: JointPose) => {
    const prefix = 'layers.' + layer.id + '.transform.'
    result.set(prefix + 'x', pose.pivot.x - getLayerValue(base, layer.id, 'transform.anchorX', layer.transform.anchorX))
    result.set(prefix + 'y', pose.pivot.y - getLayerValue(base, layer.id, 'transform.anchorY', layer.transform.anchorY))
    result.set(prefix + 'rotationDeg', pose.angle)
  }
  for (const id of plan.order) {
    const layer = plan.byId.get(id)!
    const driver = plan.links.get(id), lower = plan.pairs.get(id)
    if (!driver && !lower) continue
    const source = readJoint(layer, base)
    const driverPose = driver && readJoint(driver, result)
    const root = driverPose ? followPivot(source, driverPose, layer.pivotLink2d!) : source
    if (lower) {
      const ik = layer.twoBoneIK2d!
      const elbow = followPivot(readJoint(lower, base), root, lower.pivotLink2d!)
      if (plan.invalid.has(id) || (layer.parentId && singularParent?.(layer.parentId))) {
        write(layer, root)
        write(lower, elbow)
        if (!plan.invalid.has(id)) report?.(layer, { status: 'inactive', reason: 'singular-parent' })
        continue
      }
      const weight = Math.max(0, Math.min(1, getLayerValue(base, layer.id, 'twoBoneIK2d.weight', ik.weight ?? 1)))
      const solved = solveTwoBone(root, elbow, readJoint(plan.byId.get(ik.targetId)!, result).pivot, ik, driverPose?.angle, weight)
      write(layer, solved.upper)
      write(lower, solved.lower)
      report?.(layer, solved.diagnostic)
    } else write(layer, root)
  }
  return result
}
