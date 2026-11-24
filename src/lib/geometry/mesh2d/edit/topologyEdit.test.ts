import { describe, it, expect } from 'vitest'
import { StructuredGridMesh2DGenerator } from '../StructuredGridMesh2DGenerator'
import { MeshComponentSelection } from '../selection/MeshComponentSelection'
import { Matrix2D } from '../../Matrix2D'
import { editMeshTopology } from './topologyEdit'
import { Mesh2DTopologyHasher } from '../Mesh2DTopologyHasher'
import { Mesh2DBoundaryRingExtractor } from '../Mesh2DBoundaryRingExtractor'
import {
  makeExecuteModifierStackCmd,
  makeMeshTopologyCmd,
  makeTransformMeshGeometryCmd,
} from '../../../editor/modifiers/commands'
import { emptyScene } from '../../../defaults'
import { newStructuredGridMesh2DLayer } from '../../../registry/definitions/mesh2d/Mesh2DDefinition'
import { parseSceneJson } from '../../../format/scene/SceneJsonConverter'

const grid = () =>
  new StructuredGridMesh2DGenerator().generate({
    width: 160,
    height: 120,
    columns: 4,
    rows: 3,
    diagonal: 'topLeftToBottomRight',
  })
const model = (g: ReturnType<typeof grid>['geometry']) => new MeshComponentSelection(g, Matrix2D.identity())

describe('Mesh sub-object topology operations', () => {
  it('replays split then vertex move in one stage with independent Undo and portable IDs', () => {
    const mesh = grid(),
      layer = { ...newStructuredGridMesh2DLayer(), mesh2d: mesh },
      scene = { ...emptyScene(), layers: [layer] }
    const edge = model(mesh.geometry).edges.find((e) => e.a === 6 && e.b === 7)!
    const cmd = makeMeshTopologyCmd(scene, layer.id, 'edit', {
      kind: 'splitEdge',
      topologyHash: mesh.geometry.topology.topologyHash,
      ids: [edge.id],
      t: 0.25,
      vertexId: 'new',
    })
    expect(cmd.changes.replacements.edges.get(edge.id)).toHaveLength(2)
    expect(Array.from(cmd.changes.replacements.faces.values()).map((ids) => ids.length)).toEqual([2, 2])
    const split = cmd.execute(scene),
      g = split.layers[0].mesh2d!.geometry
    expect(g.topology.vertexIds).toHaveLength(21)
    expect(model(g).faces.filter((f) => f.kind === 'quad')).toHaveLength(12)
    expect(model(g).faces.filter((f) => f.kind === 'triangle')).toHaveLength(2)
    expect(g.uvs.at(-2)).toBeCloseTo(mesh.geometry.uvs[12] * 0.75 + mesh.geometry.uvs[14] * 0.25)
    const move = makeTransformMeshGeometryCmd(
      split,
      layer.id,
      'edit',
      { x: 1, y: 2, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0, rotation: 0 },
      ['new'],
    )
    const moved = move.execute(split),
      restored = parseSceneJson(JSON.stringify(moved))
    expect(moved.layers[0].modifierStack!.modifiers).toHaveLength(1)
    expect(makeExecuteModifierStackCmd(restored, layer.id).execute(restored).layers[0].mesh2d).toEqual(
      moved.layers[0].mesh2d,
    )
    expect(move.undo(moved)).toEqual(split)
    expect(cmd.undo(split)).toEqual(scene)
  })
  it('fills only the removed central quad and rejects incomplete or exterior loops', () => {
    const g = grid().geometry,
      before = model(g),
      face = before.faces[5]
    const del = editMeshTopology(g, { kind: 'deleteFace', ids: [face.id], topologyHash: g.topology.topologyHash })
    const hole = del.geometry,
      boundary = model(hole)
        .edges.filter((e) => face.vertices.includes(e.a) && face.vertices.includes(e.b))
        .map((e) => e.id)
    expect(new Mesh2DBoundaryRingExtractor().extract(hole).filter((r) => r.role === 'hole')).toHaveLength(1)
    const fill = (ids: string[]) =>
      editMeshTopology(hole, { kind: 'fill', ids, topologyHash: hole.topology.topologyHash })
    expect(() => fill(boundary.slice(1))).toThrow(/hole/)
    expect(
      model(fill(boundary).geometry)
        .faces.map((f) => f.id)
        .sort(),
    ).toEqual(before.faces.map((f) => f.id).sort())
    expect(() =>
      editMeshTopology(g, {
        kind: 'deleteFace',
        ids: before.faces.map((f) => f.id),
        topologyHash: g.topology.topologyHash,
      }),
    ).toThrow(/Layer mode/)
  })
  it('flips only an interior triangle pair and preserves all UVs', () => {
    const mesh = grid(),
      topology = { ...mesh.geometry.topology, quadIndices: undefined }
    const g = { ...mesh.geometry, topology: { ...topology, topologyHash: new Mesh2DTopologyHasher().hash(topology) } }
    const before = model(g),
      diagonal = before.edges.find((e) => e.a === 0 && e.b === 6)!
    const flip = (id: string) =>
      editMeshTopology(g, { kind: 'flipEdge', ids: [id], topologyHash: g.topology.topologyHash })
    expect(flip(diagonal.id).geometry.uvs).toEqual(g.uvs)
    expect(flip(diagonal.id).changes.removedEdges).toEqual([diagonal.id])
    expect(() => flip(before.edges.find((e) => e.a === 0 && e.b === 1)!.id)).toThrow(/adjacent/)
  })
})

it('refuses locks and stale targets without changing topology or bound data', () => {
  const mesh = grid(),
    layer = { ...newStructuredGridMesh2DLayer(), mesh2d: mesh },
    scene = { ...emptyScene(), layers: [layer] }
  const action = {
    kind: 'deleteFace' as const,
    topologyHash: mesh.geometry.topology.topologyHash,
    ids: [model(mesh.geometry).faces[5].id],
  }
  expect(() =>
    makeMeshTopologyCmd({ ...scene, layers: [{ ...layer, locked: true }] }, layer.id, 'edit', action),
  ).toThrow(/unlocked/)
  const pins = {
    schemaVersion: 1 as const,
    topologyHash: action.topologyHash,
    vertexIds: [mesh.geometry.topology.vertexIds[0]],
  }
  expect(() =>
    makeMeshTopologyCmd({ ...scene, layers: [{ ...layer, mesh2d: { ...mesh, pins } }] }, layer.id, 'edit', action),
  ).toThrow(/pins/)
  expect(() => makeMeshTopologyCmd(scene, layer.id, 'edit', { ...action, topologyHash: 'stale' })).toThrow(/changed/)
})

it('fills a selected hole around a material island and leaves other holes open', () => {
  const g = new StructuredGridMesh2DGenerator().generate({ width: 180, height: 140, columns: 9, rows: 7 }).geometry
  const faces = model(g).faces
  const ids = faces
    .filter((_, i) => {
      const x = i % 9,
        y = Math.floor(i / 9)
      return (x === 7 && y === 3) || (x >= 1 && x <= 5 && y >= 1 && y <= 5 && (x !== 3 || y !== 3))
    })
    .map((f) => f.id)
  const cut = editMeshTopology(g, { kind: 'deleteFace', ids, topologyHash: g.topology.topologyHash }).geometry
  const rings = new Mesh2DBoundaryRingExtractor().extract(cut),
    ring = rings.find((r) => r.role === 'hole' && r.vertexIndices.length > 4)!
  const edges = ring.vertexIndices.map((a, i) => {
    const b = ring.vertexIndices[(i + 1) % ring.vertexIndices.length]
    return JSON.stringify([cut.topology.vertexIds[Math.min(a, b)], cut.topology.vertexIds[Math.max(a, b)]])
  })
  const filled = editMeshTopology(cut, { kind: 'fill', ids: edges, topologyHash: cut.topology.topologyHash }).geometry
  expect(new Mesh2DBoundaryRingExtractor().extract(filled).filter((r) => r.role === 'hole')).toHaveLength(1)
  const selection = model(filled)
  expect(selection.pick('face', { x: 150, y: 70 }, 0)).toBeNull()
  expect(selection.pick('face', { x: 70, y: 70 }, 0)).toBe(faces[30].id)
})

it.each(['splitEdge', 'deleteFace', 'fill', 'flipEdge'] as const)(
  '%s round-trips the exact connectivity and UVs through history and portable stack execution',
  (kind) => {
    const mesh = grid()
    let geometry = mesh.geometry
    const face = model(geometry).faces[5]
    let ids = [face.id]
    if (kind === 'fill') {
      geometry = editMeshTopology(geometry, {
        kind: 'deleteFace',
        ids,
        topologyHash: geometry.topology.topologyHash,
      }).geometry
      ids = model(geometry)
        .edges.filter((e) => face.vertices.includes(e.a) && face.vertices.includes(e.b))
        .map((e) => e.id)
    } else if (kind === 'flipEdge') {
      const topology = { ...geometry.topology, quadIndices: undefined }
      geometry = { ...geometry, topology: { ...topology, topologyHash: new Mesh2DTopologyHasher().hash(topology) } }
      ids = [model(geometry).edges.find((e) => e.a === 0 && e.b === 6)!.id]
    } else if (kind === 'splitEdge') ids = [model(geometry).edges[0].id]
    const layer = {
      ...newStructuredGridMesh2DLayer(),
      mesh2d: { ...mesh, source: { kind: 'authored' as const, schemaVersion: 1 as const }, geometry },
    }
    const scene = { ...emptyScene(), layers: [layer] }
    const command = makeMeshTopologyCmd(scene, layer.id, 'mesh-edit', {
      kind,
      ids,
      topologyHash: geometry.topology.topologyHash,
      ...(kind === 'splitEdge' ? { t: 0.25, vertexId: 'inserted' } : {}),
    })
    const after = command.execute(scene)
    expect(command.execute(command.undo(after))).toEqual(after)
    const reopened = parseSceneJson(JSON.stringify(after), true)
    const replayed = makeExecuteModifierStackCmd(reopened, layer.id).execute(reopened)
    expect(replayed.layers[0].mesh2d!.geometry).toEqual(after.layers[0].mesh2d!.geometry)
    expect(replayed.layers[0].transform).toEqual(layer.transform)
    expect(replayed.layers[0].modifierStack?.modifiers.map((record) => record.type)).toEqual(['meshTransform'])
  },
)
