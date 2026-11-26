import Ajv from 'ajv'
import { ActionRegistry } from '../../ai/ActionRegistry'
import { registerMesh2DModelingActions } from '../../editor/geometryAuthoring/Mesh2DModelingActions'
import { registerMesh2DAppearanceActions } from '../../editor/geometryAuthoring/Mesh2DAppearanceActions'
import { assertLayerAncestors } from '../../scene/hierarchy/assertLayerAncestors'
import type { ApiContext } from './LayerHandle'
import { assertSafeScriptData } from './scriptData'

const geometry = new ActionRegistry()
registerMesh2DModelingActions(geometry)
registerMesh2DAppearanceActions(geometry)
const ajv = new Ajv({ strict: false })
const operations = new Map(geometry.getAll().map(def => [def.toolName, {
  def, validate: ajv.compile({ ...def.parameters, additionalProperties: false }),
}]))
export const geometryScriptOperations = Array.from(operations.keys())

/** Execute an explicitly registered 2D modeling/appearance command in the
 * private script draft. Parameters use the native action schema, except the
 * receiver supplies layerId (sourceLayerId for independent creation). Returns
 * the resulting layer ID. No live selection, file access or global registry
 * dispatch is exposed. Geometry coordinates, budget and Undo follow the domain. */
export function scriptGeometry2D(ctx: ApiContext, id: string, operation: string, settings: Record<string, unknown> = {}) {
  const item = operations.get(operation)
  if (!item) throw new Error('Unknown 2D geometry operation: ' + operation)
  assertSafeScriptData(settings)
  if (!settings || typeof settings !== 'object' || Array.isArray(settings) || 'layerId' in settings || 'sourceLayerId' in settings)
    throw new Error('Supply geometry options for the receiving layer.')
  const create = operation === 'create_mesh2d_from_source'
  const args = { ...settings, [create ? 'sourceLayerId' : 'layerId']: id }
  if (!item.validate(args)) throw new Error('Invalid geometry options: ' + ajv.errorsText(item.validate.errors))
  const before = ctx.host.getScene(), layer = before.layers.find(l => l.id === id)
  if (!layer) throw new Error('Geometry source no longer exists.')
  assertLayerAncestors(before, layer, { editable: true })
  const command = item.def.toCommand!(args, before)
  if (!command) throw new Error('Geometry operation produced no command.')
  ctx.host.applyCommand(command)
  if (!create) return id
  const previous = new Set(before.layers.map(l => l.id))
  return ctx.host.getScene().layers.find(l => !previous.has(l.id))!.id
}
