import { MeshModifier } from './MeshModifier'
import type { GeometryModifierDescriptor } from '../geometryTypes'
import type { Mesh2DGeometry } from '../../types/mesh2d'
import { numberSetting } from '../settings'
import { LaplacianMeshSmoother } from '../../geometry/mesh2d/modeling/LaplacianMeshSmoother'

/** Registered uniform Laplacian Smooth. Owns its settings/schema/defaults;
 * the numerical solver borrows source-local geometry and retains no buffers. */
export class SmoothModifier extends MeshModifier {
  static readonly descriptor: GeometryModifierDescriptor = { type: 'meshSmooth', label: 'Smooth', category: 'mesh', inputs: ['mesh2d'], output: 'mesh2d', addable: true,
    description: 'Softens the mesh by moving vertices. Moving boundaries can shrink the outline; Keep boundary locks exterior and hole edges.',
    fields: [{ key: 'strength', label: 'Amount', kind: 'number', min: 0, max: 1, step: .05 },
      { key: 'iterations', label: 'Iterations', kind: 'number', min: 1, max: 50, step: 1 },
      { key: 'preserveBoundary', label: 'Keep boundary', kind: 'boolean' }] }
  readonly descriptor = SmoothModifier.descriptor
  /** Visible, conservative boundary rounding on a new instance. */
  static defaults() { return { strength: .25, iterations: 1, preserveBoundary: false } }
  /** Refuse malformed or fractional iteration settings without clamping. */
  validate(): void {
    numberSetting(this.settings, 'strength', 0, 1)
    const iterations = numberSetting(this.settings, 'iterations', 1, 50)
    if (!Number.isInteger(iterations) || typeof this.settings.preserveBoundary !== 'boolean') throw new Error('Smooth requires integer iterations and a Keep boundary policy.')
  }
  /** Delegate the complete settings contract to the shared pure geometry solver. */
  protected evaluateMesh(input: Mesh2DGeometry): Mesh2DGeometry {
    return new LaplacianMeshSmoother().smooth(input, { strength: numberSetting(this.settings, 'strength', 0, 1),
      iterations: numberSetting(this.settings, 'iterations', 1, 50), preserveBoundary: this.settings.preserveBoundary as boolean })
  }
}
