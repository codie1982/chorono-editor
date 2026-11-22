import { Modifier } from '../Modifier'
import type { ModifierContext, ModifierGeometry, GeometryModifierDescriptor } from '../geometryTypes'
import type { SplinePathData } from '../../types/spline'
import { assertSplineTopology } from '../../spline/topology'
import { assertModifierTargets, stableModifierSpline } from './identity'

/** Shared normalized-Spline boundary: stable target admission, immutable solver
 * input and deterministic generated IDs. Concrete classes own their settings
 * and select existing algorithms; this class owns no solver or source cache. */
export abstract class SplineModifier extends Modifier<ModifierGeometry, ModifierContext, GeometryModifierDescriptor> {
  protected evaluate(input: ModifierGeometry, context: ModifierContext): ModifierGeometry {
    if (input.kind !== 'spline') throw new Error('Spline geometry required.')
    assertSplineTopology(input.spline); assertModifierTargets(input.spline, this.settings)
    const result = this.evaluateSpline(input.spline, context)
    assertSplineTopology(result)
    return { kind: 'spline', spline: stableModifierSpline(input.spline, result, this.id) }
  }
  protected abstract evaluateSpline(input: SplinePathData, context: ModifierContext): SplinePathData
}
