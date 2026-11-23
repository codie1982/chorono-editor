import { SplineModifier } from './SplineModifier'
import type { GeometryModifierDescriptor } from '../geometryTypes'
import type { SplinePathData } from '../../types/spline'
import { targetSetting } from '../settings'
import { modifierObjectTargets } from './objectTargets'
import { smoothSplineObjects } from '../../spline/edit/smoothObjects'

/** Object-scoped Smooth over the native tangent solver. Anchors stay fixed;
 * handles/types are derived from neighboring anchors. Settings choose Objects
 * while the shared immutable stack owns source retention, order and errors. */
export class PathSmoothingModifier extends SplineModifier {
  static readonly descriptor: GeometryModifierDescriptor = { type: 'pathSmoothing', label: 'Path Smoothing', category: 'spline', inputs: ['spline'], output: 'spline', addable: true,
    description: 'Rebuild Smooth tangents without moving anchors or adding points.',
    fields: [{ key: 'objectIds', label: 'Objects', kind: 'objects' }],
  }
  static defaults() { return { objectIds: [] } }
  readonly descriptor = PathSmoothingModifier.descriptor
  validate(): void { targetSetting(this.settings, 'objectIds') }
  protected evaluateSpline(data: SplinePathData): SplinePathData { return smoothSplineObjects(data, modifierObjectTargets(data, this.settings)) }
}
