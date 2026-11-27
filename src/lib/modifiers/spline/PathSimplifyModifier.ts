import { SplineModifier } from './SplineModifier'
import type { GeometryModifierDescriptor } from '../geometryTypes'
import type { SplinePathData } from '../../types/spline'
import { numberSetting, targetSetting } from '../settings'
import { modifierObjectTargets } from './objectTargets'
import { simplifySplineObjects } from '../../spline/edit/simplifyObjects'

/** Immutable Object-scoped adapter over native polynomial Simplify. Surviving
 * anchors, sharp corners, endpoints and hole ownership retain native semantics;
 * each Execute recomputes against this stage's borrowed input, never old output. */
export class PathSimplifyModifier extends SplineModifier {
  static readonly descriptor: GeometryModifierDescriptor = { type: 'pathSimplify', label: 'Path Simplify', category: 'spline', inputs: ['spline'], output: 'spline', addable: true,
    description: 'Reduce redundant points within local-pixel tolerance, keeping sharp turns, endpoints and holes.',
    fields: [{ key: 'tolerancePx', label: 'Tolerance', kind: 'number', min: .001, max: 1000, step: .1, unit: 'local px' },
      { key: 'objectIds', label: 'Objects', kind: 'objects' }],
  }
  static defaults() { return { tolerancePx: .5, objectIds: [] } }
  readonly descriptor = PathSimplifyModifier.descriptor
  validate(): void { numberSetting(this.settings, 'tolerancePx', .001, 1000); targetSetting(this.settings, 'objectIds') }
  protected evaluateSpline(data: SplinePathData): SplinePathData {
    return simplifySplineObjects(data, modifierObjectTargets(data, this.settings), numberSetting(this.settings, 'tolerancePx', .001, 1000))
  }
}
