import type { LayerDefinition } from '../../registry/LayerDefinition'
import type { PropertyGroup, PropertySchema } from '../../registry/PropertySchema'
import { transformGroup, appearanceGroup, sizeGroup } from '../../registry/definitions/sharedSchemas'
import { newModelLayer } from './modelDefaults'
/** Numeric schema shared by Properties, MCP introspection and typed animation.
 * Bounds are source capabilities, not a promise of a full 3D workspace. */
function number(path: string, label: string, value: number, min?: number, max?: number): PropertySchema {
  return { id: path, path: `model3d.${path}`, group: '3D', label, valueType: 'number', animatable: true, defaultValue: value, step: .1, min, max }
}
/** Finished first-slice layer definition: ordinary 2D box plus distinct 3D
 * presentation coordinates. New placeholders show an explicit import prompt. */
export const modelDefinition: LayerDefinition = {
  kind: 'model3d', label: '3D Model', iconKey: 'group', category: 'Media', propertyGroupsAreStatic: true,
  createDefault: () => newModelLayer(`model3d_${crypto.randomUUID()}`),
  getPropertyGroups: (): PropertyGroup[] => [transformGroup(), appearanceGroup(), { ...sizeGroup(), schemas: sizeGroup().schemas.map(schema => ({ ...schema, max: 4096 })) },
    { title: '3D Model · presentation units', schemas: [
      ...['x', 'y', 'z'].map(axis => number(`position.${axis}`, `Position ${axis.toUpperCase()}`, 0)),
      ...['x', 'y', 'z'].map(axis => number(`rotation.${axis}`, `Rotation ${axis.toUpperCase()} (deg)`, 0)),
      number('scale', '3D Scale', 1, .001, 1000),
    ] },
    { title: '3D Camera', schemas: [number('camera.yaw', 'Orbit yaw (deg)', 30), number('camera.pitch', 'Orbit pitch (deg)', 15, -89, 89),
      number('camera.distance', 'Distance', 3.5, .1, 1000), number('camera.fov', 'Field of view (deg)', 45, 5, 150),
      ...['X', 'Y', 'Z'].map(axis => number(`camera.target${axis}`, `Target ${axis}`, 0)),
    ] },
    { title: '3D Lighting', schemas: [number('lighting.ambient', 'Ambient intensity', 1.5, 0, 20), number('lighting.key', 'Key intensity', 3, 0, 20)] },
  ],
}
