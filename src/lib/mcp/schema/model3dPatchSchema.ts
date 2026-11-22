import { modelDefinition } from '../../model3d/source/modelDefinition'
import { MAX_MODEL_BOX_SIDE } from '../../model3d/source/modelDefaults'

type Schema = { type: string; properties?: Record<string, Schema>; additionalProperties?: boolean; minProperties?: number; minimum?: number; maximum?: number; description?: string }

/** Build the MCP model edit schema from the same static property descriptors
 * used by the inspector. Only model3d presentation numbers are exposed; assetId,
 * version, imported nodes and timeline-only fields cannot enter this tool. */
export function model3dPatchSchema(): Schema {
  const root: Schema = { type: 'object', properties: {}, additionalProperties: false }
  for (const group of modelDefinition.getPropertyGroups(modelDefinition.createDefault())) {
    for (const field of group.schemas) {
      if (!field.path.startsWith('model3d.') || field.valueType !== 'number') continue
      const parts = field.path.slice('model3d.'.length).split('.')
      let current = root
      for (const part of parts.slice(0, -1)) {
        current.properties ??= {}
        current = current.properties[part] ??= { type: 'object', properties: {}, additionalProperties: false, minProperties: 1,
          description: `Partial model3d.${part} settings; omitted sibling fields remain unchanged.` }
      }
      current.properties ??= {}
      current.properties[parts.at(-1)!] = { type: 'number', description: `${field.label}; ${field.path}. ${field.path.includes('rotation') || field.path.includes('camera.yaw') || field.path.includes('camera.pitch') || field.path.includes('camera.fov') ? 'Degrees.' : 'Normalized model presentation units unless labeled otherwise.'}`,
        ...(field.min === undefined ? {} : { minimum: field.min }), ...(field.max === undefined ? {} : { maximum: field.max }) }
    }
  }
  return root
}

/** Source box dimensions use composition pixels, not model presentation units. */
export function model3dBoxSchema(): Schema {
  const size = (axis: string): Schema => ({ type: 'number', minimum: 1, maximum: MAX_MODEL_BOX_SIDE, description: `Outer 2D box ${axis} in composition pixels, 1..${MAX_MODEL_BOX_SIDE}.` })
  return { type: 'object', properties: { width: size('width'), height: size('height') }, additionalProperties: false, minProperties: 1,
    description: 'Optional outer 2D model box dimensions; omit to retain both dimensions.' }
}
