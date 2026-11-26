import type { ActionRegistry } from '../../ai/ActionRegistry'
import { geometryModifierRegistry } from '../../modifiers'
import { makeBakeModifierStackCmd, makeExecuteModifierStackCmd, makeMoveModifierCmd, makeRemoveModifierCmd,
  makeSetModifierSettingsCmd, makeToggleModifierCmd, prepareAddModifier } from '../modifiers/commands'

type Row = { modifierId: string }
type StackEdit = { kind: 'add'; type: string } | { kind: 'settings'; values: Record<string, unknown> } & Row
  | { kind: 'toggle'; enabled: boolean } & Row | { kind: 'move'; direction: 'up' | 'down' } & Row
  | { kind: 'remove' } & Row | { kind: 'execute' | 'bake' }

const row = { type: 'string', description: 'Stable modifier instance ID in layer.modifierStack.modifiers.' }

/** Project the native, ordered, layer-local stack onto explicit source operations.
 * Fields and addable types come from the installed geometry strategies. Settings
 * cannot write private solver state or retarget another row. Each call returns
 * one editor command with the same validation, evaluation and Undo as the panel. */
export function registerGeometryStackAction(registry: ActionRegistry) {
  const kind = (value: string) => ({ type: 'string', enum: [value], description: 'Stack operation.' })
  const variants = [
    { kind: kind('add'), type: { type: 'string', enum: geometryModifierRegistry.list().filter(d => d.addable).map(d => d.type), description: 'Registered modifier type for the previous row’s output. Read the new row ID from the layer after adding.' } },
    { kind: kind('settings'), modifierId: row, values: { type: 'object', additionalProperties: true, description: 'Changed editable fields from the descriptor in get_capabilities. Sibling settings are preserved.' } },
    { kind: kind('toggle'), modifierId: row, enabled: { type: 'boolean', description: 'Whether this row contributes to the evaluated result.' } },
    { kind: kind('move'), modifierId: row, direction: { type: 'string', enum: ['up', 'down'], description: 'Move one row towards source or result.' } },
    { kind: kind('remove'), modifierId: row }, { kind: kind('execute') }, { kind: kind('bake') },
  ]
  registry.register({
    id: 'geometry.editStack', toolName: 'edit_2d_modifier_stack',
    description: 'Add, configure, enable, reorder, remove, execute or bake geometry modifiers on a spline or Mesh2D. Bake collapses the source and ordered rows to editable geometry in one Undo.',
    parameters: { type: 'object', properties: { layerId: { type: 'string', description: 'Geometry layer ID.' },
      operation: { description: 'One stack edit. Example: {kind:"add",type:"meshSmooth"}.', anyOf: variants.map(fields => ({
        type: 'object', additionalProperties: false, properties: Object.fromEntries(Object.entries(fields)), required: Object.keys(fields),
      })) } }, required: ['layerId', 'operation'] },
    toCommand: ({ layerId, operation }: { layerId: string; operation: StackEdit }, scene) => {
      const layer = scene.layers.find(item => item.id === layerId)
      if (!layer || !['spline', 'mesh2d'].includes(layer.type)) throw new Error('Choose an editable Spline or Mesh2D layer.')
      switch (operation.kind) {
        case 'add': return prepareAddModifier(scene, layerId, operation.type).command
        case 'settings': {
          const record = layer.modifierStack?.modifiers.find(item => item.id === operation.modifierId)
          if (!record) throw new Error('Modifier no longer exists.')
          const fields = geometryModifierRegistry.get(record.type).descriptor.fields
          if (Object.keys(operation.values).some(key => !fields.some(field => field.key === key))) throw new Error('Unknown or private modifier setting.')
          return makeSetModifierSettingsCmd(scene, layerId, record.id, operation.values)
        }
        case 'toggle': return makeToggleModifierCmd(scene, layerId, operation.modifierId, operation.enabled)
        case 'move': return makeMoveModifierCmd(scene, layerId, operation.modifierId, operation.direction === 'up' ? -1 : 1)
        case 'remove': return makeRemoveModifierCmd(scene, layerId, operation.modifierId)
        case 'execute': return makeExecuteModifierStackCmd(scene, layerId)
        case 'bake': return makeBakeModifierStackCmd(scene, layerId)
      }
    },
  })
}
