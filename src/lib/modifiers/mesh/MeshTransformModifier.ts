import { MeshModifier } from './MeshModifier'
import type { GeometryModifierDescriptor, ModifierGeometry } from '../geometryTypes'
import type { Mesh2DGeometry } from '../../types/mesh2d'
import { Matrix2D } from '../../geometry/Matrix2D'
import { computeMesh2DLocalBounds } from '../../geometry/mesh2d'
import { numberSetting } from '../settings'

/** Editable local-geometry affine stage. Positions move; layer TRS/anchor,
 * topology, IDs and UVs remain unchanged. Positive scale preserves winding and
 * holes. The canonical stack retains upstream source and each edit's order;
 * MeshModifier owns attachment admission and rebuilt boundary rings. Stateless. */
export class MeshTransformModifier extends MeshModifier {
  static readonly descriptor: GeometryModifierDescriptor = { type: 'meshTransform', label: 'Edit Mesh', category: 'mesh',
    inputs: ['mesh2d'], output: 'mesh2d', addable: true,
    description: 'Moves, rotates or scales local mesh geometry while keeping the object transform and origin fixed.',
    fields: [
      { key: 'x', label: 'X', kind: 'number', min: -1e6, max: 1e6, unit: 'px' },
      { key: 'y', label: 'Y', kind: 'number', min: -1e6, max: 1e6, unit: 'px' },
      { key: 'rotation', label: 'Rotation', kind: 'number', min: -36000, max: 36000, unit: 'deg' },
      { key: 'scaleX', label: 'Scale X', kind: 'number', min: .01, max: 100, step: .01 },
      { key: 'scaleY', label: 'Scale Y', kind: 'number', min: .01, max: 100, step: .01 },
      { key: 'pivotX', label: 'Local pivot X', kind: 'number', min: -1e7, max: 1e7, unit: 'px' },
      { key: 'pivotY', label: 'Local pivot Y', kind: 'number', min: -1e7, max: 1e7, unit: 'px' },
    ] }
  readonly descriptor = MeshTransformModifier.descriptor
  /** Picker defaults use the source-local bounds center and identity motion. */
  static defaults(input: ModifierGeometry) {
    const box = input.kind === 'mesh2d' ? computeMesh2DLocalBounds(input.mesh.geometry) : null
    return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1,
      pivotX: box ? box.x + box.width / 2 : 0, pivotY: box ? box.y + box.height / 2 : 0 }
  }
  /** Refuse non-finite, singular or unbounded local affine settings. */
  validate(): void {
    for (const key of ['x', 'y']) numberSetting(this.settings, key, -1e6, 1e6)
    for (const key of ['pivotX', 'pivotY']) numberSetting(this.settings, key, -1e7, 1e7)
    for (const key of ['scaleX', 'scaleY']) numberSetting(this.settings, key, .01, 100)
    numberSetting(this.settings, 'rotation', -36000, 36000)
  }
  /** Apply one local-pixel affine, preserving a texture's original reference box. */
  protected evaluateMesh(input: Mesh2DGeometry): Mesh2DGeometry {
    const s = this.settings as ReturnType<typeof MeshTransformModifier.defaults>
    if (!s.x && !s.y && !s.rotation && s.scaleX === 1 && s.scaleY === 1) return input
    const matrix = Matrix2D.translation(s.x, s.y).translate(s.pivotX, s.pivotY)
      .rotate(s.rotation).scale(s.scaleX, s.scaleY).translate(-s.pivotX, -s.pivotY)
    const positions: number[] = []
    for (let i = 0; i < input.positions.length; i += 2) {
      const point = matrix.applyToPoint({ x: input.positions[i], y: input.positions[i + 1] })
      positions.push(point.x, point.y)
    }
    const box = input.textureReferenceBounds ?? computeMesh2DLocalBounds(input)
    return { ...input, positions, ...(box ? { textureReferenceBounds: box } : {}) }
  }
}
