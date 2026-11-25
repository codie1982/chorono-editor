import type { ActionRegistry } from '@/lib/ai/ActionRegistry'
import { prepareGeometryConversion } from '@/lib/editor/commands-geometry-conversion'
import { makeExecuteModifierStackCmd, makeMeshTopologyCmd, prepareAddModifier } from '@/lib/editor/modifiers/commands'
import { meshEditStageId } from '@/lib/editor/modifiers/meshEditStageId'
import { uid } from '@/lib/spline/util/uid'

const layerId = { type: 'string', description: 'Stable layer id from get_scene.' }

/** Register in-place modeling commands on the same source, Undo and modifier
 * evaluation boundary as the canvas. Edge positions use directed stable IDs,
 * and each new request resolves topology against its authorized scene. */
export function registerMesh2DModelingActions(registry: ActionRegistry): void {
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
