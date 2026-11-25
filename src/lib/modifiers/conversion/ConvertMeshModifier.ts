import { Modifier } from '../Modifier'
import type { ModifierContext, GeometryModifierDescriptor, ModifierGeometry } from '../geometryTypes'
import { numberSetting } from '../settings'
import { SplineToMeshConverter } from '../../geometry/conversion/SplineToMeshConverter'

/** Validated Spline → fixed-topology Mesh conversion, shared with legacy entry
 * points. Sampling tolerance is local px; holes, UVs and stroke rings survive. */
export class ConvertMeshModifier extends Modifier<ModifierGeometry, ModifierContext, GeometryModifierDescriptor> {
  static readonly descriptor: GeometryModifierDescriptor = { type: 'convertMesh2d', label: 'Convert 2D Mesh', category: 'mesh', inputs: ['spline'], output: 'mesh2d', addable: false,
    fields: [{ key: 'tolerancePx', label: 'Curve tolerance', kind: 'number', min: .01, max: 10, step: .05, unit: 'px' }] }
  /** Defaults for a newly owned instance; empty targets mean all eligible elements. */
  static defaults() { return { tolerancePx: .25 } }
  readonly descriptor = ConvertMeshModifier.descriptor
  validate(): void { numberSetting(this.settings, 'tolerancePx', .01, 10) }
  protected evaluate(input: ModifierGeometry, context: ModifierContext): ModifierGeometry {
    if (input.kind !== 'spline') throw new Error('Convert Mesh requires Spline geometry.')
    return { kind: 'mesh2d', mesh: new SplineToMeshConverter().convert(context.layerId, input.spline, numberSetting(this.settings, 'tolerancePx', .01, 10)) }
  }
}
