import type { ChronoScene, Layer } from '../../types'
import type { EditorCommand } from '../commands-keyframe'
import { numericPropertyConstraints } from '../../expression/properties/NumericPropertyCapability'
import { propertyExpressionConstraints, type ScalarExpressionType } from '../../expression/properties/PropertyExpressionCapability'
import { readPropertyPath } from '../../scene/properties/readPropertyPath'
import { writePropertyPath } from '../../scene/properties/writePropertyPath'
import { drivenChannelReason } from '../../timeline/authoring/keyableChannels'
import { syncTextLayerSize } from '../../text/measureText'
import { inspectNumericFormula, type NumericConstraints } from './NumericInputExpression'

/** Resolve source capability through the existing registry. Identity/structural
 * and array-index properties are not formula targets in A1. Live instances must
 * be edited at their definition/source or detached first. */
export function numericExpressionConstraints(layer: Layer, path: string): NumericConstraints {
  if (layer.locked || layer.frozen) throw new Error('Unlock this layer before editing its formula.')
  if (layer.instanceOf) throw new Error('Edit the instance source or detach this instance first.')
  return numericPropertyConstraints(layer, path)
}
/** Report existing animation/binding/path ownership instead of silently replacing
 * it with a constant expression. All timelines are considered, including muted
 * or currently inactive ones. A1 does not remove or bake existing drivers. */
export function numericExpressionBlock(scene: ChronoScene, layer: Layer, path: string, ignorePropertyExpression = false, resultType: ScalarExpressionType = 'number'): string | null {
  try {
    if (layer.locked || layer.frozen || layer.instanceOf) throw new Error('Unlock this layer; edit live instances at their source or detach first.')
    propertyExpressionConstraints(layer, path, resultType)
  } catch (error) { return (error as Error).message }
  const target = `layers.${layer.id}.${path}`
  if (scene.timelines.some(timeline => timeline.tracks.some(track => track.target === target && (track.keyframes.length || track.controller)))) return 'This channel is animated. Keep its keys; use a different field or an explicit bake workflow.'
  return drivenChannelReason(scene, layer, path, undefined, { ignorePropertyExpression })
}
/** Atomic source value + persistent authoring recipe. Expected source identity
 * prevents a stale popup from replacing any intervening human/agent edit. Undo
 * restores the exact source; editor attribution stamps the single command.
 * null converts to the current source value, including a manually changed one.
 * Constant results already render/export through existing numeric leaf fields. */
export function makeNumericExpressionCommand(expected: ChronoScene, layerId: string, path: string, formula: string | null, limits: NumericConstraints = {}): EditorCommand {
  return { label: formula === null ? 'Convert expression to value' : 'Set numeric input expression',
    execute(scene) {
      if (scene !== expected) throw new Error('Source changed. Review the current value before applying your draft.')
      const layer = scene.layers.find(item => item.id === layerId)
      if (!layer) throw new Error('The target layer no longer exists.')
      if (layer.locked || layer.frozen) throw new Error('Unlock this layer before editing its formula.')
      const blocked = formula === null ? null : numericExpressionBlock(scene, layer, path)
      if (blocked) throw new Error(blocked)
      const fields = { ...layer.inputExpressions?.fields }
      let next = layer
      if (formula !== null) {
        const schema = numericExpressionConstraints(layer, path), result = inspectNumericFormula(formula, {
          min: Math.max(limits.min ?? -Infinity, schema.min ?? -Infinity), max: Math.min(limits.max ?? Infinity, schema.max ?? Infinity),
        })
        if (result.error) throw new Error(result.error)
        if (!Object.hasOwn(fields, path) && Object.keys(fields).length >= 128) throw new Error('Layer formula limit exceeded.')
        fields[path] = { formula, value: result.value! }; next = writePropertyPath(layer, path, result.value, true)
      } else { readPropertyPath(layer, path); delete fields[path] }
      next = { ...next, inputExpressions: Object.keys(fields).length ? { version: 1, fields } : undefined }
      if (path.startsWith('text.')) next = syncTextLayerSize(next, scene.assets)
      return { ...scene, layers: scene.layers.map(item => item.id === layerId ? next : item) }
    }, undo: () => expected,
  }
}
