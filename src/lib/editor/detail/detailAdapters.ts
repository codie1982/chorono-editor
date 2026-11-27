import type { ChronoScene, Layer } from '../../types'
import { layerRegistry } from '../../registry'
import { propertyPathsOverlap } from '../../scene/properties/propertyPathsOverlap'
import { readPropertyPath } from '../../scene/properties/readPropertyPath'
import { parseTrackTarget } from '../../timeline/TrackTargetParser'
import { drivenChannelReason } from '../../timeline/authoring/keyableChannels'
import { validateModel } from '../../model3d/source/modelDefaults'
import { ItemDetailRegistry, type ItemDetailAdapter } from './ItemDetailRegistry'

/** Protect an entire content root before a static draft edit. Existing keys,
 * procedural controllers, expressions and bindings remain authoritative; this
 * first slice never silently removes/bakes/rekeys them. Sibling roots may edit.
 */
export function detailDrivenReason(scene: ChronoScene, layer: Layer, path: string): string | null {
  const reason = drivenChannelReason(scene, layer, path)
  if (reason) return reason
  for (const timeline of scene.timelines) for (const track of timeline.tracks) {
    const target = parseTrackTarget(track.target)
    if (target?.entityType === 'layer' && target.entityId === layer.id && propertyPathsOverlap(target.propertyPath, path)) {
      if (track.keyframes.length || track.controller || track.easeCurve || track.modifiers?.length) {
        return 'Existing animation drives this content. Edit or explicitly bake it in its owning Timeline first.'
      }
    }
  }
  return null
}

/** Explain why a target cannot open; missing metadata never grants source-instance
 * ownership. Unsupported families retain their existing editor/inline actions.
 */
export function detailUnavailableReason(layer: Layer | undefined, registry = itemDetailRegistry): string | null {
  if (!layer) return 'Select an item first.'
  if (layer.locked || layer.frozen) return 'Unlock and unfreeze the item first.'
  if (layer.instanceOf) return 'Edit the source item or make this instance unique first.'
  if (!registry.find(layer)) return 'A detail editor for this item type is not available yet.'
  return null
}

/** Public editor entry policy: 2D content stays in the main viewport/Properties.
 * Shared source adapters remain available internally without enabling their
 * context-menu or double-click entry. Model content retains its private editor.
 * Lock/instance/multi-selection restrictions are checked separately.
 */
export function hasItemDetailEntry(layer: Layer | undefined): boolean {
  return layer?.type === 'model3d'
}

/** Build a stateless schema adapter. Its owning domain keeps geometry/model
 * semantics; source schemas provide field constraints and inspector groups.
 */
function schemaAdapter(id: string, label: string, type: Layer['type'], fields: readonly (keyof Layer)[]): ItemDetailAdapter {
  const groups = (layer: Layer) => (layerRegistry.findForLayer(layer)?.getPropertyGroups(layer) ?? [])
    .map(group => ({ ...group, schemas: group.schemas.filter(schema => fields.some(field => schema.path.startsWith(`${field}.`) || schema.path === field)) }))
    .filter(group => group.schemas.length)
  return { id, label, fields, supports: layer => layer.type === type, groups,
    validate(layer) {
      for (const group of groups(layer)) for (const schema of group.schemas) {
        if (schema.showWhen && !schema.showWhen(layer)) continue
        const value = readPropertyPath(layer, schema.path)
        if (value === undefined) continue // Optional authored fallback is preserved.
        if (['number', 'angle', 'percent'].includes(schema.valueType)
          && (typeof value !== 'number' || !Number.isFinite(value) || schema.min !== undefined && value < schema.min || schema.max !== undefined && value > schema.max)) {
          throw new Error(`${schema.label} is outside its supported range.`)
        }
      }
      if (type === 'model3d') {
        if (!layer.model3d) throw new Error('Missing model content.')
        validateModel(layer.model3d)
      }
      if (type === 'path' && layer.path) {
        if (!Array.isArray(layer.path.anchors) || layer.path.anchors.length > 10000) throw new Error('Unsupported path size.')
        for (const point of layer.path.anchors) for (const key of ['x', 'y', 'inX', 'inY', 'outX', 'outY'] as const) {
          const value = point[key]
          if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e6)) throw new Error('Invalid path coordinate.')
        }
      }
    },
  }
}

/** Built-in composition. Media/UV/component editors add a capability when their
 * tools ship; declaring a menu entry does not advertise an unimplemented editor.
 */
export const itemDetailRegistry = new ItemDetailRegistry()
itemDetailRegistry.register(schemaAdapter('shape', 'Shape content', 'shape', ['size', 'shapeParams', 'style']))
itemDetailRegistry.register(schemaAdapter('path', 'Path content', 'path', ['path', 'style']))
itemDetailRegistry.register(schemaAdapter('model3d', '3D placement', 'model3d', ['model3d']))
