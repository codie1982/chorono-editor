import { SplineModifier } from './SplineModifier'
import type { GeometryModifierDescriptor } from '../geometryTypes'
import type { SplinePathData } from '../../types/spline'
import { numberSetting, targetSetting } from '../settings'
import { createOffsetOutline } from '../../spline/modeling/offsetOutline'
import { PolygonClippingBackend } from '../../geometry/boolean/PolygonClippingBackend'
import { pathDefinitionToSpline } from '../../geometry/conversion/ShapeToSplineConverter'
import { splineToPathDefinition } from '../../spline/splineToPath'
import { removeSplineContours } from '../../spline/topology'
import { mergeSplineData } from '../../spline/factory/mergeSplineData'

/** Symmetric filled border around selected contours. Reuses the existing band
 * generator (0.25 local-pixel sampling, butt caps for open contours) and Boolean
 * union for overlapping bands. Width is total width, not one-side displacement. */
export class OutlineModifier extends SplineModifier {
  static readonly descriptor: GeometryModifierDescriptor = { type: 'outline', label: 'Outline', category: 'spline', inputs: ['spline'], output: 'spline', addable: true, legacySplineTool: true,
    fields: [{ key: 'widthPx', label: 'Width', kind: 'number', min: .02, max: 20000, step: .1, unit: 'px' },
      { key: 'contourIds', label: 'Contours', kind: 'contours' }] }
  /** Defaults for a newly owned instance; empty targets mean all eligible elements. */
  static defaults() { return { widthPx: 2, contourIds: [] } }
  readonly descriptor = OutlineModifier.descriptor
  validate(): void { numberSetting(this.settings, 'widthPx', .02, 20000); targetSetting(this.settings, 'contourIds') }
  protected evaluateSpline(data: SplinePathData): SplinePathData {
    const requested = targetSetting(this.settings, 'contourIds'), ids = requested.length ? requested : Object.keys(data.contours)
    if (!ids.length || ids.length > 8 || ids.some(id => !data.contours[id])) throw new Error('Outline requires 1–8 existing contours.')
    const bands = ids.map(contourId => createOffsetOutline(data, { contourId, distance: numberSetting(this.settings, 'widthPx', .02, 20000) / 2,
      direction: data.contours[contourId].closed ? 'outward' : 'left', mode: 'outline' }))
    const boundary = bands.length === 1 ? bands[0] : pathDefinitionToSpline(new PolygonClippingBackend().compute({ operation: 'union', reverse: false,
      tolerancePx: .25, operands: bands.map((band, i) => ({ label: `Outline ${i + 1}`, path: splineToPathDefinition(band), fillRule: band.fillRule })),
    }).path, 'nonzero')
    return mergeSplineData(removeSplineContours(data, new Set(ids)), boundary)
  }
}
