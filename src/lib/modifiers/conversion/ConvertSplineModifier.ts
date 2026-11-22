import { Modifier } from '../Modifier'
import type { GeometryModifierDescriptor, ModifierGeometry, ModifierContext } from '../geometryTypes'
import type { SplinePathData } from '../../types/spline'
import { GeometryConversionService } from '../../geometry/conversion/GeometryConversionService'
import { assertSplineTopology } from '../../spline/topology'

/** Exact primitive/union representation stage, preserving authored control
 * overrides migrated from conversion v1. No intermediate scene layer exists. */
export class ConvertSplineModifier extends Modifier<ModifierGeometry, ModifierContext, GeometryModifierDescriptor> {
  static readonly descriptor: GeometryModifierDescriptor = { type: 'convertSpline', label: 'Convert Spline', preservesSourceEditing: true, category: 'spline', inputs: ['shape', 'spline'], output: 'spline', fields: [], addable: false }
  /** Defaults for a newly owned instance; empty targets mean all eligible elements. */
  static defaults() { return {} }
  readonly descriptor = ConvertSplineModifier.descriptor
  validate(): void {
    if (this.settings.edited !== undefined) assertSplineTopology(this.settings.edited as SplinePathData)
  }
  protected evaluate(input: ModifierGeometry): ModifierGeometry {
    if (this.settings.edited) return { kind: 'spline', spline: this.settings.edited as SplinePathData }
    if (input.kind === 'spline') return input
    if (input.kind !== 'shape') throw new Error('Convert Spline requires shape geometry.')
    return { kind: 'spline', spline: new GeometryConversionService().boundary({ version: 1, sources: input.sources,
      stages: [], unionTolerancePx: input.unionTolerancePx }) }
  }
}
