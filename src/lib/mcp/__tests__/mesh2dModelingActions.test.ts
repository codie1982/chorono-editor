import { beforeAll, expect, it } from 'vitest'
import { actionRegistry } from '@/lib/ai/ActionRegistry'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import { prepareGeometryConversion } from '@/lib/editor/commands-geometry-conversion'
import { containsMesh2DPoint } from '@/lib/geometry/mesh2d'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'
import type { ChronoScene } from '@/lib/types'
import { bootstrapMCPActions } from '../actions'
import { getToolCatalog, validateToolCall } from '../catalog'

beforeAll(() => bootstrapMCPActions())

/** Execute one MCP-discoverable native command and exercise its exact Undo. */
function apply(scene: ChronoScene, name: string, params: Record<string, unknown>) {
  const command = actionRegistry.get(name)!.toCommand!(params, scene)!
  const after = command.execute(scene)
  expect(command.undo(after)).toBe(scene)
  return after
}

it('publishes the in-place workflow and requires a current source read', async () => {
  const tools = (await getToolCatalog()).map(tool => tool.name)
  expect(tools).toEqual(expect.arrayContaining(['convert_layer_to_mesh2d', 'split_mesh2d_edge', 'apply_mesh2d_subdivision']))
  await expect(validateToolCall('convert_layer_to_mesh2d', { layerId: 'a' })).rejects.toThrow()
})

it('keeps a spline hole, layer identity and origin through a directed split and both subdivision strategies', () => {
  const bars = [[0, 0, 120, 20], [0, 100, 120, 20], [0, 20, 20, 80], [100, 20, 20, 80]]
  const layers = bars.map(([x, y, width, height], index) => {
    const rect = newRectLayer()
    return { ...rect, id: 'bar-' + index, size: { width, height }, style: { ...rect.style, cornerRadius: 0 },
      transform: { ...rect.transform, x: x + 37, y: y + 11, anchorX: 0, anchorY: 0 } }
  })
  const base = { ...emptyScene(), layers }
  const spline = prepareGeometryConversion(base, layers.map(l => l.id), 'spline').command.execute(base)
  const { id: layerId, transform } = spline.layers[0]
  const converted = apply(spline, 'convert_layer_to_mesh2d', { layerId })
  const mesh = converted.layers[0].mesh2d!
  const topology = mesh.geometry.topology
  const [b, a] = mesh.boundaryRings![1]
  const edge = { layerId, topologyHash: topology.topologyHash, fromVertexId: topology.vertexIds[a], toVertexId: topology.vertexIds[b], t: 0.25 }
  const split = apply(converted, 'split_mesh2d_edge', edge)
  const geom = split.layers[0].mesh2d!.geometry
  const inserted = geom.topology.vertexIds.find(id => !topology.vertexIds.includes(id))!
  const i = geom.topology.vertexIds.indexOf(inserted)
  for (const k of [0, 1]) expect(geom.positions[2*i+k]).toBeCloseTo(mesh.geometry.positions[2*a+k]*0.75 + mesh.geometry.positions[2*b+k]*0.25)
  expect(() => apply(split, 'split_mesh2d_edge', edge)).toThrow(/topology changed/i)
  const delaunay = apply(split, 'apply_mesh2d_subdivision', { layerId, algorithm: 'delaunay', cellSizePx: 32 })
  expect(delaunay.layers[0].mesh2d!.geometry.topology.vertexIds).toContain(inserted)
  const modifierId = delaunay.layers[0].modifierStack!.modifiers.at(-1)!.id
  const settings = { layerId, modifierId, algorithm: 'grid' }
  const grid = apply(delaunay, 'apply_mesh2d_subdivision', settings)
  expect(grid.layers[0].mesh2d!.geometry.topology.quadIndices!.length).toBeGreaterThan(0)
  expect(grid.layers[0].modifierStack!.modifiers.filter(r => r.type === 'meshSubdivision')).toHaveLength(1)
  for (const scene of [converted, split, delaunay, grid]) {
    expect(scene.layers).toHaveLength(1)
    expect(scene.layers[0]).toMatchObject({ id: layerId, transform })
    expect(scene.layers[0].mesh2d!.boundaryRings).toHaveLength(2)
    expect(containsMesh2DPoint(scene.layers[0].mesh2d!.geometry, 60, 60)).toBe(false)
  }
  const reopened = parseSceneJson(JSON.stringify(grid), true)
  expect(apply(reopened, 'apply_mesh2d_subdivision', settings).layers[0].mesh2d!.geometry).toEqual(grid.layers[0].mesh2d!.geometry)
})
