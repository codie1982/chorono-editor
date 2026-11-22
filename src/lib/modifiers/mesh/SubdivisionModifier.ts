import { MeshModifier } from './MeshModifier'
import type { GeometryModifierDescriptor, ModifierContext } from '../geometryTypes'
import type { Mesh2DGeometry } from '../../types/mesh2d'
import { numberSetting, enumSetting } from '../settings'
import { MeshSubdivision } from '../../geometry/mesh2d/modeling/subdivision/MeshSubdivision'

/** Registered strategy-based Subdivision. Delaunay and Grid own independent
 * algorithms; settings rebuild from this stage's current stack input. */
export class SubdivisionModifier extends MeshModifier {
  static readonly descriptor: GeometryModifierDescriptor = { type: 'meshSubdivision', label: 'Subdivision', category: 'mesh', inputs: ['mesh2d'], output: 'mesh2d', addable: true,
    description: 'Delaunay creates a boundary-constrained triangle mesh. Grid creates square cells with fitted boundary transitions. Higher levels reduce cell size.',
    fields: [{ key: 'algorithm', label: 'Algorithm', kind: 'select', options: [{ value: 'delaunay', label: 'Delaunay' }, { value: 'grid', label: 'Grid / Karelaj' }] },
      { key: 'levels', label: 'Levels', kind: 'number', min: 0, max: 4, step: 1 },
      { key: 'cellSizePx', label: 'Base cell size', kind: 'number', min: 1, max: 10000, step: 1, unit: 'px' }] }
  readonly descriptor = SubdivisionModifier.descriptor
  /** Delaunay is primary; one level samples at half the base cell size. */
  static defaults() { return { algorithm: 'delaunay', levels: 1, cellSizePx: 40 } }
  /** Validate the class-owned discrete level, algorithm and spacing contract. */
  validate(): void {
    if (!Number.isInteger(numberSetting(this.settings, 'levels', 0, 4))) throw new Error('Subdivision levels must be an integer from 0 to 4.')
    numberSetting(this.settings, 'cellSizePx', 1, 10000); enumSetting(this.settings, 'algorithm', ['delaunay', 'grid'])
  }
  /** Source-local remeshing never touches outer transforms or time. */
  protected evaluateMesh(input: Mesh2DGeometry, _context: ModifierContext): Mesh2DGeometry {
    return new MeshSubdivision().subdivide(input, { algorithm: enumSetting(this.settings, 'algorithm', ['delaunay', 'grid']),
      levels: numberSetting(this.settings, 'levels', 0, 4), cellSizePx: numberSetting(this.settings, 'cellSizePx', 1, 10000) }, this.id)
  }
}
