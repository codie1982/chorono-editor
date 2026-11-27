import { makeCollapseBooleanPathsCmd } from '../boolean/materializeSplineBoolean'
import { makeSeparateBooleanInputsCmd } from '../boolean/operationCommands'
import { registerGeometryStackAction } from './GeometryStackAction'
import type { ActionRegistry } from '@/lib/ai/ActionRegistry'
import { prepareGeometryConversion } from '@/lib/editor/commands-geometry-conversion'
import { makeExecuteModifierStackCmd, makeMeshTopologyCmd, makeTransformMeshGeometryCmd, prepareAddModifier } from '@/lib/editor/modifiers/commands'
import { meshEditStageId } from '@/lib/editor/modifiers/meshEditStageId'
import { uid } from '@/lib/spline/util/uid'

const layerId = { type: 'string', description: 'Stable layer id from get_scene.' }

/** Register in-place modeling commands on the same source, Undo and modifier
 * evaluation boundary as the canvas. Edge positions use directed stable IDs,
 * and each new request resolves topology against its authorized scene. */
export function registerMesh2DModelingActions(registry: ActionRegistry): void {
  registerGeometryStackAction(registry)
  registry.register({
    id: 'geometry.resolveSplineBoolean', toolName: 'resolve_spline_boolean',
    description: 'Merge a retained Boolean recipe into an editable spline with the owner ID, or release its inputs inside the original group. One Undo restores the recipe.',
    parameters: { type: 'object', properties: { layerId, action: { type: 'string', enum: ['merge', 'separate'], description: 'Merge the result or separate original inputs.' } }, required: ['layerId', 'action'] },
    toCommand: (p: { layerId: string; action: 'merge' | 'separate' }, scene) => p.action === 'merge'
      ? makeCollapseBooleanPathsCmd(scene, p.layerId).command : makeSeparateBooleanInputsCmd(scene, p.layerId).command,
  })
  registry.register({
    id: 'geometry.transformMeshVertices', toolName: 'transform_mesh2d_vertices',
    description: 'Transform selected stable vertices in mesh-local space. Pass the union of incident vertex IDs for an edge or face selection. Reuses the enabled tail Edit Mesh and preserves the layer transform and origin.',
    parameters: { type: 'object', properties: { layerId,
      topologyHash: { type: 'string', description: 'Current topology hash from the receiving mesh.' },
      vertexIds: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', description: 'One stable mesh vertex ID.' }, description: 'Explicit stable vertex IDs.' },
      transform: { type: 'object', additionalProperties: false, properties: {
        x: { type: 'number', description: 'Local x translation in px.' }, y: { type: 'number', description: 'Local y translation in px.' },
        rotation: { type: 'number', description: 'Clockwise degrees.' }, pivotX: { type: 'number', description: 'Local pivot x in px, default 0.' },
        pivotY: { type: 'number', description: 'Local pivot y in px, default 0.' }, scaleX: { type: 'number', minimum: .01, maximum: 100, description: 'Horizontal factor, default 1.' },
        scaleY: { type: 'number', minimum: .01, maximum: 100, description: 'Vertical factor, default 1.' },
      }, description: 'Local affine delta around the specified pivot.' },
    }, required: ['layerId', 'topologyHash', 'vertexIds', 'transform'] },
    toCommand: (p: { layerId: string; topologyHash: string; vertexIds: string[]; transform: Record<string, number> }, scene) => {
      const layer = scene.layers.find(item => item.id === p.layerId)
      if (!layer?.mesh2d || layer.mesh2d.geometry.topology.topologyHash !== p.topologyHash) throw new Error('Read the current mesh topology before transforming vertices.')
      const delta = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0, ...p.transform }
      return makeTransformMeshGeometryCmd(scene, layer.id, meshEditStageId(layer), delta, p.vertexIds)
    },
  })
  registry.register({
    id: 'geometry.convertToSpline', toolName: 'convert_layer_to_spline',
    description: 'Convert one basic shape to an editable spline on the same layer, retaining its source and transform.',
    parameters: { type: 'object', properties: { layerId }, required: ['layerId'] },
    toCommand: (p: { layerId: string }, scene) => prepareGeometryConversion(scene, [p.layerId], 'spline').command,
  })
  registry.register({
    id: 'geometry.editMeshTopology', toolName: 'edit_mesh2d_topology',
    description: 'Flip one visible shared edge, delete selected logical faces, or fill one complete hole in the tail Edit Mesh stage. For a directed split use split_mesh2d_edge.',
    parameters: { type: 'object', properties: { layerId,
      action: { type: 'string', enum: ['flipEdge', 'deleteFace', 'fill'], description: 'Mesh topology operation on the explicit component selection.' },
      topologyHash: { type: 'string', description: 'Current mesh2d.geometry.topology.topologyHash.' },
      ids: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', description: 'One logical face ID or encoded edge.' }, description: 'Logical face IDs (triangle: or quad: plus JSON of sorted vertex IDs) or JSON vertex-ID pairs. For Fill supply all hole boundary edges, lower vertex index first.' },
    }, required: ['layerId', 'action', 'ids', 'topologyHash'] },
    toCommand: (p: { layerId: string; action: 'flipEdge' | 'deleteFace' | 'fill'; topologyHash: string; ids: string[] }, scene) => {
      const layer = scene.layers.find(item => item.id === p.layerId)
      if (layer?.type !== 'mesh2d') throw new Error('Select a Mesh2D layer.')
      return makeMeshTopologyCmd(scene, layer.id, meshEditStageId(layer), { kind: p.action, topologyHash: p.topologyHash, ids: p.ids })
    },
  })
  registry.register({
    id: 'mcp.convertLayerToMesh2D', toolName: 'convert_layer_to_mesh2d',
    description: 'Convert a closed spline or basic shape to Mesh2D in place. Preserve layer id, transform and enclosed holes, and retain the source in its modifier stack.',
    parameters: { type: 'object', properties: { layerId }, required: ['layerId'] },
    toCommand: (p: { layerId: string }, scene) => prepareGeometryConversion(scene, [p.layerId], 'mesh2d').command,
  })
  registry.register({
    id: 'mcp.splitMesh2DEdge', toolName: 'split_mesh2d_edge',
    description: 'Split one logical mesh edge in the tail Edit Mesh stage. Read topologyHash and stable endpoint vertex ids from get_scene. A stale hash or hidden quad diagonal is rejected.',
    parameters: { type: 'object', properties: {
      layerId,
      topologyHash: { type: 'string', description: 'Current mesh2d.geometry.topology.topologyHash.' },
      fromVertexId: { type: 'string', description: 'Stable id of the edge start in topology.vertexIds.' },
      toVertexId: { type: 'string', description: 'Stable id of the adjacent vertex at the other end.' },
      t: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1, description: 'Fraction measured from the first endpoint to the second. Defaults to 0.5.' },
    }, required: ['layerId', 'topologyHash', 'fromVertexId', 'toVertexId'] },
    toCommand: (p: { layerId: string; topologyHash: string; fromVertexId: string; toVertexId: string; t?: number }, scene) => {
      const layer = scene.layers.find(item => item.id === p.layerId)
      if (layer?.type !== 'mesh2d') throw new Error('Select a Mesh2D layer.')
      return makeMeshTopologyCmd(scene, layer.id, meshEditStageId(layer), {
        kind: 'splitEdge', ids: [JSON.stringify([p.fromVertexId, p.toVertexId])], topologyHash: p.topologyHash,
        t: p.t ?? 0.5, vertexId: uid('mesh-vertex'),
      })
    },
  })
  registry.register({
    id: 'mcp.applyMesh2DSubdivision', toolName: 'apply_mesh2d_subdivision',
    description: 'Add Subdivision to a Mesh2D and execute the ordered stack in one Undo. Supply an existing subdivision modifierId to update and execute that row. Delaunay preserves boundary vertices. Grid fits square cells and can resample straight boundaries.',
    parameters: { type: 'object', properties: {
      layerId,
      algorithm: { type: 'string', enum: ['delaunay', 'grid'], description: 'Boundary-constrained Delaunay triangles or fitted Grid quads.' },
      levels: { type: 'integer', minimum: 0, maximum: 4, description: 'Refinement level, 0 through 4. Defaults to 1 on a new row.' },
      cellSizePx: { type: 'number', minimum: 1, maximum: 10000, description: 'Base spacing in mesh-local pixels. Defaults to 40 on a new row.' },
      modifierId: { type: 'string', description: 'Optional existing enabled meshSubdivision row id on this layer. Omitted settings retain their values.' },
    }, required: ['layerId', 'algorithm'] },
    toCommand: (p: { layerId: string; modifierId?: string; algorithm: string; levels?: number; cellSizePx?: number }, scene) => {
      const { layerId, modifierId, algorithm, levels, cellSizePx } = p
      const settings = { algorithm, ...(levels !== undefined && { levels }), ...(cellSizePx !== undefined && { cellSizePx }) }
      if (modifierId !== undefined) {
        const row = scene.layers.find(item => item.id === layerId)?.modifierStack?.modifiers.find(item => item.id === modifierId)
        if (row?.type !== 'meshSubdivision' || !row.enabled) throw new Error('Choose an enabled Subdivision row on this mesh.')
        return makeExecuteModifierStackCmd(scene, layerId, { [modifierId]: settings })
      }
      const added = prepareAddModifier(scene, layerId, 'meshSubdivision', undefined, settings)
      if (added.warning) throw new Error(added.warning.replace(/^Added disabled: /, 'Subdivision failed: '))
      return added.command
    },
  })
}
