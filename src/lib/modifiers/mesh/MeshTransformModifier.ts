import { MeshModifier } from './MeshModifier'
import type { GeometryModifierDescriptor, ModifierGeometry } from '../geometryTypes'
import type { Mesh2DGeometry } from '../../types/mesh2d'
import { computeMesh2DLocalBounds } from '../../geometry/mesh2d'
import { meshTransformMatrix, readMeshTransformSettings } from './meshTransformSettings'
import { readMeshVertexEdits } from './meshVertexEdits'
import { Mesh2DTopologyValidator } from '../../geometry/mesh2d/Mesh2DTopologyValidator'

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
    readMeshTransformSettings(this.settings)
    readMeshVertexEdits(this.settings)
  }
  /** Apply one local-pixel affine, preserving a texture's original reference box. */
  protected evaluateMesh(input: Mesh2DGeometry): Mesh2DGeometry {
    const s = readMeshTransformSettings(this.settings)
    const edits = readMeshVertexEdits(this.settings)
    if (edits && edits.topologyHash !== input.topology.topologyHash) throw new Error('Mesh topology changed. Reset vertex edits before continuing.')
    if (!edits && !s.x && !s.y && !s.rotation && s.scaleX === 1 && s.scaleY === 1) return input
    const offsets = new Map(edits?.offsets.map(([id, x, y]) => [id, { x, y }]))
    const known = new Set(input.topology.vertexIds)
    if (edits && edits.offsets.some(([id]) => !known.has(id))) throw new Error('An edited mesh vertex no longer exists.')
    const matrix = meshTransformMatrix(s)
    const positions: number[] = []
    for (let i = 0; i < input.positions.length; i += 2) {
      const point = matrix.applyToPoint({ x: input.positions[i], y: input.positions[i + 1] })
      const offset = offsets.get(input.topology.vertexIds[i / 2])
      positions.push(point.x + (offset?.x ?? 0), point.y + (offset?.y ?? 0))
    }
    const box = input.textureReferenceBounds ?? computeMesh2DLocalBounds(input)
    const result = { ...input, positions, ...(box ? { textureReferenceBounds: box } : {}) }
    if (edits && !new Mesh2DTopologyValidator().validate(result).valid) throw new Error('This vertex edit collapses or reverses a mesh face.')
    return result
  }
}
