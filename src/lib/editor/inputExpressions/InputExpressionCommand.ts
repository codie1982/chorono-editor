import type { ChronoScene } from '../../types'
import type { EditorCommand } from '../commands-keyframe'
import { expressionPrograms } from '../../core/expression/ExpressionProgramCache'
import { evaluateTypedExpression, type ExpressionValueType } from '../../core/expression/expressionEvaluator'
import { inputExpressionBlock, assertExpressionTarget } from './ExpressionAuthoringGuard'
import type { NumericConstraints } from '../../core/expression/NumericResult'
import { validatePropertyExpressionValue, expressionValueToSource } from '../../expression/properties/PropertyExpressionValue'
import { readPropertyPath } from '../../scene/properties/readPropertyPath'
import { writeInputExpressionValue } from './writeInputExpressionValue'
import { syncTextLayerSize } from '../../text/measureText'
import { inputExpressionValue, type InputExpression } from './InputExpression'

/** Set/remove one constant typed recipe + authored value as an exact source-CAS
 * transaction. Numeric records keep the legacy shape. Existing keys/drivers,
 * stable identity, unrelated source and field records are never overwritten.
 * No per-frame execution is introduced by a constant/configuration formula. */
export function makeInputExpressionCommand(expected: ChronoScene, layerId: string, path: string, formula: string | null, kind: ExpressionValueType, limits: NumericConstraints = {}): EditorCommand {
  return { label: formula === null ? 'Convert formula to value' : 'Set input formula', execute(scene) {
    if (scene !== expected) throw new Error('Source changed. Review the current value before applying this draft.')
    const layer = scene.layers.find(item => item.id === layerId)
    if (!layer) throw new Error('The target layer no longer exists.')
    assertExpressionTarget(layer, path, kind, 'constant')
    const fields = { ...layer.inputExpressions?.fields }
    let next = layer
    if (formula !== null) {
      const blocked = inputExpressionBlock(scene, layer, path, false, kind, 'constant')
      if (blocked) throw new Error(blocked)
      if (!Object.hasOwn(fields, path) && Object.keys(fields).length >= 128) throw new Error('Layer formula limit exceeded.')
      const program = expressionPrograms.get(formula)
      if (!program.ast) throw new Error(program.error ?? 'Invalid formula')
      const output = evaluateTypedExpression(program.ast, { pi: Math.PI, e: Math.E })
      const value = validatePropertyExpressionValue(layer, path, kind, output, 'constant', limits)
      const stored = expressionValueToSource(layer, path, value, kind)
      next = writeInputExpressionValue(layer, path, stored)
      fields[path] = { formula, value: inputExpressionValue(stored, kind) as InputExpression['value'], ...(kind === 'number' ? {} : { resultType: kind }) }
    } else { readPropertyPath(layer, path); delete fields[path] }
    next = { ...next, inputExpressions: Object.keys(fields).length ? { version: 1, fields } : undefined }
    if (path.startsWith('text.')) next = syncTextLayerSize(next, scene.assets)
    return { ...scene, layers: scene.layers.map(item => item.id === layerId ? next : item) }
  }, undo: () => expected }
}
