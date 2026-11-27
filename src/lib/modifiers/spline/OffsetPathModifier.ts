import { OffsetModifier } from './OffsetModifier'
import type { GeometryModifierDescriptor } from '../geometryTypes'
import type { SplinePathData } from '../../types/spline'

/** Modern source-local parallel-contour operation. Shares the compatibility
 * adapter's settings/solver but keeps original Object identity and sampling
 * metadata. Immutable instance; generic stack owns ordering and publication. */
export class OffsetPathModifier extends OffsetModifier {
  static readonly descriptor: GeometryModifierDescriptor = { ...OffsetModifier.descriptor,
    type: 'offsetPath', label: 'Offset Path', legacySplineTool: false,
    description: 'Parallel contours from the retained source. Distance/tolerance use local px; closed boundaries include their holes.',
    fields: OffsetModifier.descriptor.fields.map(field => field.unit === 'px' ? { ...field, unit: 'local px' } : field),
  }
  readonly descriptor = OffsetPathModifier.descriptor
  protected evaluateSpline(data: SplinePathData): SplinePathData { return this.offset(data, true) }
}
