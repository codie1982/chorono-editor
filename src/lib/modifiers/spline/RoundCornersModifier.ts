import { FilletModifier } from './FilletModifier'
import type { GeometryModifierDescriptor } from '../geometryTypes'

/** Parametric corner-radius adapter over the authoritative Fillet implementation.
 * Existing fillet records keep their type/descriptor. This immutable operation
 * shares radius validation, corner targeting and exact native solver admission. */
export class RoundCornersModifier extends FilletModifier {
  static readonly descriptor: GeometryModifierDescriptor = { ...FilletModifier.descriptor,
    type: 'roundCorners', label: 'Round Corners', legacySplineTool: false,
    description: 'Round eligible corners from the retained source using a radius in local px.',
    fields: FilletModifier.descriptor.fields.map(field => field.unit === 'px' ? { ...field, unit: 'local px' } : field),
  }
  readonly descriptor = RoundCornersModifier.descriptor
}
