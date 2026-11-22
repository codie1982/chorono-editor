import { assertLayerAncestors } from '../../scene/hierarchy/assertLayerAncestors'
import type { ChronoScene, Layer } from '../../types'
import type { OverrideMap } from '../../evaluator'
import { transformPathDefinition } from '../../geometry'
import { layerBooleanOperand } from '../../geometry/boolean/layerOperand'
import { createLayerWorldMatrixResolver } from '../../geometry/resolveLayerWorldMatrix'
import { BOOLEAN_LIMITS, type BooleanOperand } from '../../geometry/boolean'
import { materializeLayerOverrides } from '../../render/materializeOverrides'

export interface BooleanTarget { layerId: string; subShapeId?: string; label: string }
/** Select up to eight whole layers, or Object-mode SubShapes in one spline.
 * Primary selected layer is A; remaining inputs form B. The order of SubShape
 * selection is retained, including its first selected A. No source inspection
 * or conversion is performed here, so toolbar rendering stays lightweight. */
export function booleanTargets(scene: ChronoScene, ids: ReadonlySet<string>, primary: string | null,
  objectSelection?: { layerId: string; ids: readonly string[] }): BooleanTarget[] {
  if (objectSelection) {
    const layer = scene.layers.find(item => item.id === objectSelection.layerId)
    return objectSelection.ids.map(id => ({ layerId: objectSelection.layerId, subShapeId: id, label: layer?.spline?.subShapes[id]?.name || id }))
  }
  const ordered = Array.from(ids)
  if (primary && ids.has(primary)) ordered.sort((a, b) => a === primary ? -1 : b === primary ? 1 : 0)
  return ordered.map(id => ({ layerId: id, label: scene.layers.find(item => item.id === id)?.name || id }))
}

/** Snapshot bounded evaluated geometry in composition space using the same
 * shape/spline converters, override projection and parent matrices as rendering.
 * All contours must be closed; no implicit filling of open strokes. Instances
 * and broken hierarchy refuse explicitly. Paint, masks, stroke thickness and
 * effects are deliberately outside this area-geometry preview. Both outer and
 * internal animation records remain borrowed and untouched. */
export function prepareBooleanOperands(scene: ChronoScene, targets: readonly BooleanTarget[], timeMs: number, overrides: OverrideMap): BooleanOperand[] {
  if (targets.length < 2 || targets.length > BOOLEAN_LIMITS.operands) throw new Error(`Select 2–${BOOLEAN_LIMITS.operands} shapes, splines or spline Objects.`)
  const matrixFor = createLayerWorldMatrixResolver(scene, timeMs, overrides)
  let count = 0
  return targets.map(target => {
    const source = scene.layers.find(layer => layer.id === target.layerId)
    if (!source || source.instanceOf) throw new Error('Choose source shapes/splines; instance geometry preview is not supported yet.')
    assertLayerAncestors(scene, source)
    const layer = materializeLayerOverrides(source, overrides)
    const { path, fillRule } = layerBooleanOperand(layer, target.subShapeId)
    count += path.commands.length
    if (count > BOOLEAN_LIMITS.commands) throw new Error('Boolean path-command budget exceeded.')
    const matrix = matrixFor(source)
    if (Math.abs(matrix.determinant()) < 1e-9) throw new Error('Boolean input transform is singular.')
    return { label: target.label, path: transformPathDefinition(path, matrix), fillRule }
  })
}
