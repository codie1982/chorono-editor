import { FilletModifier } from './FilletModifier'
import type { GeometryModifierDescriptor } from '../geometryTypes'
import type { SplinePathData } from '../../types/spline'
import { roundSplineCorners } from '../../spline/fillet'
import { numberSetting, targetSetting } from '../settings'

/** Parametric corner-radius adapter over the authoritative Fillet implementation.
 * Existing fillet records keep their type/descriptor. This immutable operation
 * shares radius validation and native solver admission. Modern targeting uses
 * Corner/Bézier Corner types and recognizes already circular straight-flanked
 * corners, replacing their radius from retained source on every execution. */
export class RoundCornersModifier extends FilletModifier {
  static readonly descriptor: GeometryModifierDescriptor = { ...FilletModifier.descriptor,
    type: 'roundCorners', label: 'Round Corners', legacySplineTool: false,
    description: 'Set an absolute radius on Corner / Bézier Corner points. Updates existing circular corners between straight sides; Smooth points are not automatic targets. Radius uses local px.',
    fields: FilletModifier.descriptor.fields.map(field => field.unit === 'px' ? { ...field, unit: 'local px' } : field),
  }
  readonly descriptor = RoundCornersModifier.descriptor
  /** Source geometry/IDs remain borrowed; the domain adapter owns recognition. */
  protected evaluateSpline(data: SplinePathData): SplinePathData {
    return roundSplineCorners(data, targetSetting(this.settings, 'pointIds'), numberSetting(this.settings, 'radiusPx', .1, 10000))
  }
}
