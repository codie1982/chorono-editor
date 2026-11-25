import { editMeshTopology, type MeshTopologyEdit } from '../../geometry/mesh2d/edit/topologyEdit'
import { MeshModifier } from './MeshModifier'
import type { GeometryModifierDescriptor, ModifierGeometry } from '../geometryTypes'
import type { Mesh2DGeometry } from '../../types/mesh2d'
import { computeMesh2DLocalBounds } from '../../geometry/mesh2d'
import { meshTransformMatrix, readMeshTransformSettings } from './meshTransformSettings'
import { readMeshVertexEdits } from './meshVertexEdits'
import { Mesh2DTopologyValidator } from '../../geometry/mesh2d/Mesh2DTopologyValidator'

/** Replays ordered topology steps with their preceding local transforms, then
 * applies the pending affine and vertex offsets. Layer TRS and anchor belong
 * to the layer. MeshModifier validates attachment compatibility and rebuilds
 * boundary rings. Legacy transform-only records start with an empty history. */
export class MeshTransformModifier extends MeshModifier {
  static readonly descriptor: GeometryModifierDescriptor = { type: 'meshTransform', label: 'Edit Mesh', category: 'mesh',
    inputs: ['mesh2d'], output: 'mesh2d', addable: true,
    description: 'Edits local vertices, edges and faces. The layer transform and origin stay fixed.',
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
  /** Replay each step against its own input topology in local pixels. */
  protected evaluateMesh(input: Mesh2DGeometry): Mesh2DGeometry {
    let geometry = input
    const steps = this.settings.topologySteps
    if (steps !== undefined) {
      if (!Array.isArray(steps) || steps.length > 1024) throw new Error('Invalid Edit Mesh operation history.')
      for (const step of steps) {
        if (!step?.transform || !step.edit) throw new Error('Invalid Edit Mesh operation.')
        geometry = applyAffine(geometry, step.transform)
        geometry = editMeshTopology(geometry, step.edit as MeshTopologyEdit).geometry
      }
    }
    return applyAffine(geometry, this.settings)
  }
}

/** Apply the pending affine and selected vertex offsets in the coordinate frame
 * of the preceding topology step. All inputs are borrowed. */
function applyAffine(input: Mesh2DGeometry, settings: Readonly<Record<string, unknown>>): Mesh2DGeometry {
    const s = readMeshTransformSettings(settings)
    const edits = readMeshVertexEdits(settings)
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
