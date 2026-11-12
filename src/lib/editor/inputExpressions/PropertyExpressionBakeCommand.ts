import type { EditorCommand } from '../commands-keyframe'
import type { PreparedPropertyExpressionBake } from '../../expression/properties/preparePropertyExpressionBake'
import { propertyExpressionTarget } from './PropertyExpressionCommand'
import { validateBakeOptions } from '../../animation/baking/bake'

/** Atomically publish a reviewed native-key conversion and remove only that
 * live driver. CAS guards whole source/parameters captured in the preview;
 * generated timeline/key IDs stay stable across Undo/Redo. Unrelated source,
 * timelines, recipes and fallback values are preserved. */
export function makeApplyPropertyExpressionBakeCmd(prepared: PreparedPropertyExpressionBake): EditorCommand {
  const { source, layerId, path } = prepared, timeline = structuredClone(prepared.timeline)
  return { label: 'Bake live expression to keyframes', execute(scene) {
    const layer = propertyExpressionTarget(scene, source, layerId, path)
    validateBakeOptions(prepared.options)
    if (!layer.propertyExpressions?.fields[path] || scene.timelines.some(item => item.id === timeline.id)) throw new Error('Expression source or bake timeline changed. Preview again.')
    const fields = { ...layer.propertyExpressions.fields }; delete fields[path]
    return { ...scene, layers: scene.layers.map(item => item.id !== layerId ? item : {
      ...item, propertyExpressions: Object.keys(fields).length ? { version: 1, fields } : undefined,
    }), timelines: [...scene.timelines, timeline] }
  }, undo: () => source }
}
