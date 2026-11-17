import { modelInstanceInputGroup } from '../content/modelInstanceInputs'
import type { LayerDefinition } from '../../registry/LayerDefinition'
import type { PropertyGroup, PropertySchema } from '../../registry/PropertySchema'
import { transformGroup, appearanceGroup, sizeGroup } from '../../registry/definitions/sharedSchemas'
import { MAX_MODEL_BOX_SIDE, newModelLayer } from './modelDefaults'
import { modelChannels, readModelChannelValue, MODEL_CONTENT_PATHS } from '../animation/modelChannels'
/** Static placement schema shared by Properties and MCP introspection.
 * Bounds are source capabilities, not a promise of a full 3D workspace. */
function number(path: string, label: string, value: number, min?: number, max?: number): PropertySchema {
  return { id: path, path: `model3d.${path}`, group: '3D', label, valueType: 'number', animatable: false, defaultValue: value, step: .1, min, max }
}
/** Finished first-slice layer definition: ordinary 2D box plus distinct 3D
 * presentation coordinates. New placeholders show an explicit import prompt. */
export const modelDefinition: LayerDefinition = {
  kind: 'model3d', label: '3D Model', iconKey: 'group', category: '3D Objects', propertyGroupsAreStatic: false,
  timelineExcludedPaths: ['model3d'],
  contentTimelinePaths: MODEL_CONTENT_PATHS,
  getContentTimelinePaths: layer => modelChannels(layer.model3d),
  readContentTimelineValue: readModelChannelValue,
  createDefault: () => newModelLayer(`model3d_${crypto.randomUUID()}`),
  getPropertyGroups: (layer): PropertyGroup[] => [modelInstanceInputGroup(layer),transformGroup(), appearanceGroup(), { ...sizeGroup(), title: '2D Model Box · px', schemas: sizeGroup().schemas.map(schema => ({ ...schema, max: MAX_MODEL_BOX_SIDE })) },
    { title: '3D Model · metres', schemas: [
      ...['x', 'y', 'z'].map(axis => number(`position.${axis}`, `Position ${axis.toUpperCase()} (m)`, 0)),
      ...['x', 'y', 'z'].map(axis => number(`rotation.${axis}`, `Rotation ${axis.toUpperCase()} (deg)`, 0)),
      number('scale', '3D Scale', 1, .001, 1000),
    ] },
    { title: '3D Camera', schemas: [number('camera.yaw', 'Orbit yaw (deg)', 30), number('camera.pitch', 'Orbit pitch (deg)', 15, -90, 90), number('camera.roll', 'Roll (deg)', 0, -180, 180),
      number('camera.distance', 'Distance (m)', 3.5, .1, 1000), number('camera.fov', 'Field of view (deg)', 45, 5, 150),
      ...['X', 'Y', 'Z'].map(axis => number(`camera.target${axis}`, `Target ${axis} (m)`, 0)),
    ] },
    ...(layer.model3d?.content ? [{ title: '3D Exposed inputs', schemas: Object.entries(layer.model3d.content.parameters).map(([id, p]): PropertySchema => ({ id: `modelParameter.${id}`, path: `model3d.content.parameters.${id}.value`, label: p.name, group: '3D', valueType: p.type, animatable: true, defaultValue: p.value, min: p.min, max: p.max, step: .1 })) }] : []),
    { title: '3D Lighting', schemas: [number('lighting.ambient', 'Ambient intensity', 1.5, 0, 20), number('lighting.key', 'Key intensity', 3, 0, 20)] },
  ],
}
