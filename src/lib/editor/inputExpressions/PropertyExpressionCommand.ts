import type { ChronoScene, Layer } from '../../types'
import type { EditorCommand } from '../commands-keyframe'
import type { PropertyExpression } from '../../expression/properties/PropertyExpression'
import { assertScenePropertyExpressions } from '../../expression/properties/PropertyExpression'
import { evaluateSceneFrame, type SceneFrameOptions } from '../../runtime/evaluateSceneFrame'
import { makeNumericExpressionCommand, numericExpressionBlock } from './NumericExpressionCommand'
import { writePropertyPath } from '../../scene/properties/writePropertyPath'
import { syncTextLayerSize } from '../../text/measureText'
import { propertyExpressionConstraints, type ScalarExpressionType } from '../../expression/properties/PropertyExpressionCapability'

export interface ExpressionReviewFrame { timeMs: number; options?: SceneFrameOptions }

/** Exact immutable source CAS and editor ownership guard, shared by Set,
 * Remove/Convert and bake. No command replays an old field over a changed scene. */
export function propertyExpressionTarget(scene: ChronoScene, expected: ChronoScene, layerId: string, path: string, kind?: ScalarExpressionType): Layer {
  if (scene !== expected) throw new Error('Source changed. Review the current source before applying this expression draft.')
  const layer = scene.layers.find(item => item.id === layerId)
  if (!layer) throw new Error('The target layer no longer exists.')
  if (layer.locked || layer.frozen || layer.instanceOf) throw new Error('Unlock this layer; edit live instances at their source or detach first.')
  propertyExpressionConstraints(layer, path, kind ?? layer.propertyExpressions?.fields[path]?.resultType ?? 'number')
  return layer
}

/** Apply a serializable live driver without changing the authored fallback.
 * Static-recipe replacement is explicit; existing native keys/bindings remain
 * protected. The current review frame must resolve successfully, including
 * named source types, timeline, graph cycles and target bounds. Runtime errors
 * occurring at other times use visible deterministic fallback, not NaN source. */
export function makeSetPropertyExpressionCmd(expected: ChronoScene, layerId: string, path: string, definition: PropertyExpression,
  review: ExpressionReviewFrame = { timeMs: 0 }, replaceConstant = false): EditorCommand {
  const source = structuredClone(definition)
  return { label: 'Set live property expression', execute(scene) {
    const layer = propertyExpressionTarget(scene, expected, layerId, path, source.resultType)
    const blocked = numericExpressionBlock(scene, layer, path, true, source.resultType)
    if (blocked) throw new Error(blocked)
    if (layer.inputExpressions?.fields[path] && !replaceConstant) throw new Error('Explicitly replace the saved constant formula before adding a live driver.')
    const staticFields = { ...layer.inputExpressions?.fields }; delete staticFields[path]
    const nextLayer = { ...layer, propertyExpressions: { version: 1 as const, fields: { ...layer.propertyExpressions?.fields, [path]: structuredClone(source) } },
      inputExpressions: Object.keys(staticFields).length ? { version: 1 as const, fields: staticFields } : undefined }
    const next = { ...scene, layers: scene.layers.map(item => item.id === layerId ? nextLayer : item) }
    assertScenePropertyExpressions(next)
    const frame = evaluateSceneFrame(next, review.timeMs, review.options)
    const error = frame.expressionErrors.get('layers.' + layerId + '.' + path) ?? frame.expressionErrors.get('scene')
    if (error) throw new Error(error)
    return next
  }, undo: () => expected }
}

/** Remove a live recipe, optionally sampling its current valid output into the
 * numeric source. Omit review to keep the original authored fallback. The two
 * operations are explicit and each is one exact Undo/Redo step. */
export function makeRemovePropertyExpressionCmd(expected: ChronoScene, layerId: string, path: string, review?: ExpressionReviewFrame): EditorCommand {
  return { label: review ? 'Convert live expression to value' : 'Remove live expression', execute(scene) {
    let layer = propertyExpressionTarget(scene, expected, layerId, path)
    if (!layer.propertyExpressions?.fields[path]) throw new Error('This field has no live expression.')
    if (review) {
      const key = 'layers.' + layerId + '.' + path, frame = evaluateSceneFrame(scene, review.timeMs, review.options)
      const error = frame.expressionErrors.get(key) ?? frame.expressionErrors.get('scene'), value = frame.overrides.get(key)
      if (error || typeof value !== layer.propertyExpressions!.fields[path].resultType || typeof value === 'number' && !Number.isFinite(value)) throw new Error(error ?? 'Expression has no valid value to convert.')
      layer = writePropertyPath(layer, path, value, true)
    }
    const fields = { ...layer.propertyExpressions!.fields }; delete fields[path]
    layer = { ...layer, propertyExpressions: Object.keys(fields).length ? { version: 1, fields } : undefined }
    if (review && path.startsWith('text.')) layer = syncTextLayerSize(layer, scene.assets)
    return { ...scene, layers: scene.layers.map(item => item.id === layerId ? layer : item) }
  }, undo: () => expected }
}

/** Explicit mode switch in one transaction. Reuse both existing commands with
 * each intermediate immutable source as its CAS token; nothing commits halfway. */
export function makeReplaceLiveWithConstantCmd(expected: ChronoScene, layerId: string, path: string, formula: string): EditorCommand {
  return { label: 'Replace live expression with constant formula', execute(scene) {
    const removed = makeRemovePropertyExpressionCmd(expected, layerId, path).execute(scene)
    return makeNumericExpressionCommand(removed, layerId, path, formula).execute(removed)
  }, undo: () => expected }
}
