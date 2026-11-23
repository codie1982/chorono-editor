import { SplineModifier } from './SplineModifier'
import type { GeometryModifierDescriptor, ModifierGeometry } from '../geometryTypes'
import type { SplinePathData } from '../../types/spline'
import { numberSetting, enumSetting, targetSetting } from '../settings'
import { offsetSplineContours } from '../../spline/outline'

/** Parallel-boundary modifier over the shared planar solver. Distances are local
 * pixels. Holes and unselected contours constrain offset admission; open ends
 * remain open. Output replaces selected contours, never appends a scene layer. */
export class OffsetModifier extends SplineModifier {
  static readonly descriptor: GeometryModifierDescriptor = {
    type: 'offset', label: 'Offset', category: 'spline', inputs: ['spline'], output: 'spline', addable: true, legacySplineTool: true,
    fields: [
      { key: 'distancePx', label: 'Distance', kind: 'number', min: .01, max: 10000, step: .1, unit: 'px' },
      { key: 'side', label: 'Direction', kind: 'select', options: ['inside', 'outside', 'left', 'right', 'both'].map(value => ({ value, label: value })) },
      { key: 'join', label: 'Join', kind: 'select', options: ['miter', 'bevel', 'round'].map(value => ({ value, label: value })) },
      { key: 'miterLimit', label: 'Miter limit', kind: 'number', min: 1, max: 100, step: .1 },
      { key: 'tolerancePx', label: 'Curve tolerance', kind: 'number', min: .05, max: 5, step: .05, unit: 'px' },
      { key: 'contourIds', label: 'Contours', kind: 'contours' },
    ],
  }
  /** Defaults for a newly owned instance; empty targets mean all eligible elements. */
  static defaults(input: ModifierGeometry) { return { distancePx: 1, side: input.kind === 'spline' && Object.values(input.spline.contours).every(c => c.closed) ? 'outside' : 'left', join: 'miter', miterLimit: 4, tolerancePx: .25, contourIds: [] } }
  readonly descriptor = OffsetModifier.descriptor
  validate(): void {
    numberSetting(this.settings, 'distancePx', .01, 10000); numberSetting(this.settings, 'miterLimit', 1, 100)
    numberSetting(this.settings, 'tolerancePx', .05, 5); enumSetting(this.settings, 'side', ['inside', 'outside', 'left', 'right', 'both'])
    enumSetting(this.settings, 'join', ['miter', 'bevel', 'round']); targetSetting(this.settings, 'contourIds')
  }
  protected evaluateSpline(data: SplinePathData): SplinePathData {
    return this.offset(data)
  }
  /** Shared settings/solver adapter. Modern offsets preserve Object ownership;
   * legacy records keep their historical replacement-Object behavior. */
  protected offset(data: SplinePathData, preserveObjects = false): SplinePathData {
    const requested = targetSetting(this.settings, 'contourIds'), ids = requested.length ? requested : Object.keys(data.contours)
    if (ids.some(id => !data.contours[id])) throw new Error('Offset contour no longer exists.')
    return offsetSplineContours(data, ids, { distancePx: numberSetting(this.settings, 'distancePx', .01, 10000),
      side: enumSetting(this.settings, 'side', ['inside', 'outside', 'left', 'right', 'both']),
      join: enumSetting(this.settings, 'join', ['miter', 'bevel', 'round']), miterLimit: numberSetting(this.settings, 'miterLimit', 1, 100),
      tolerancePx: numberSetting(this.settings, 'tolerancePx', .05, 5),
    }, preserveObjects)
  }
}
