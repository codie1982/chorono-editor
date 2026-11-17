'use client'
import type { PrimitiveObject } from '@/lib/model3d/modeling/poly/primitiveSource'
import { meshBorderEdges, meshElements, primitiveMeshSnapshot, type MeshSnapshot } from '@/lib/model3d/modeling/poly/meshSnapshot'
import type { PolyEditSelection, PolySelectionMode } from '@/lib/model3d/modeling/poly/editSelection'
import { formatModelLength, fromModelMeters, modelMeasurement, type ModelMeasurementSettings } from '@/lib/model3d/measurement/modelMeasurement'
import type { Model3DData } from '@/lib/model3d/types'

const modes: readonly [PolySelectionMode, string][] = [['object', 'Object'], ['vertex', 'Vertex'], ['edge', 'Edge'], ['border', 'Border'], ['polygon', 'Polygon'], ['element', 'Element']]

/** View-local Edit Poly controls. No modifier row is fabricated until a real
 * geometry operation is committed; the base primitive remains parametric. */
export function ModelEditPolyPanel({ data, object, selection, onMode, onExit }: {
  data: Model3DData; object: PrimitiveObject; selection: PolyEditSelection
  onMode(mode: PolySelectionMode): void; onExit(): void
}) {
  const mesh = primitiveMeshSnapshot(object.geometry), measure = modelMeasurement(data)
  const count = selection.mode === 'object' ? 1 : selection.mode === 'element'
    ? meshElements(mesh).filter(island => island.some(id => selection.ids.includes(id))).length : selection.ids.length
  const noun = selection.mode === 'vertex' ? count === 1 ? 'vertex' : 'vertices'
    : selection.mode === 'border' ? count === 1 ? 'border edge' : 'border edges'
      : `${selection.mode}${count === 1 ? '' : 's'}`
  return <section className="space-y-3 text-xs text-slate-200" aria-label="Edit Poly panel">
    <div className="flex items-center justify-between gap-2"><h3 className="text-cyan-300">Edit Poly · {object.name}</h3>
      <button type="button" className="rounded border border-slate-600 bg-slate-800 px-2 py-1 hover:bg-slate-700" onClick={onExit}>Exit Edit Mode</button></div>
    <div role="group" aria-label="Poly selection mode" className="grid grid-cols-3 gap-1">
      {modes.map(([mode, label]) => <button key={mode} type="button" aria-pressed={selection.mode === mode} onClick={() => onMode(mode)}
        className={`rounded border px-2 py-1.5 focus-visible:outline-2 focus-visible:outline-cyan-300 ${selection.mode === mode ? 'border-cyan-400 bg-cyan-900 text-white' : 'border-slate-700 bg-slate-800 hover:bg-slate-700'}`}>{label}</button>)}
    </div>
    <p aria-live="polite">{count} {noun} selected</p>
    <p className="text-slate-400">{mesh.vertices.length} vertices · {mesh.edges.length} edges · {mesh.faces.length} polygons · {meshBorderEdges(mesh).length} border edges · {meshElements(mesh).length} elements</p>
    <p className="text-slate-400">Measurements: object local · {measure.unit} / {measure.unit}². World dimensions are on the Object tab.</p>
    {count === 1 && selection.mode !== 'object' && <p className="rounded border border-slate-700 bg-[#101b2d] p-2" aria-label="Selected component properties">
      {selection.mode === 'element' ? `${selection.ids.length} polygons in connected element`
        : selection.ids.length === 1 ? describeComponent(mesh, selection.mode, selection.ids[0], measure)
          : `${selection.ids.length} edges in boundary loop`}
    </p>}
    <p className="border-t border-slate-700 pt-2 text-slate-400">Geometry operations will appear here when their algorithms are available.</p>
  </section>
}

/** Read-only local-metre component measurement; never mutates the source. */
function describeComponent(mesh: MeshSnapshot, mode: PolySelectionMode, id: string, measure: ModelMeasurementSettings): string {
  const length = (metres: number) => formatModelLength(metres, measure)
  const position = (vertexId: string) => mesh.vertices.find(vertex => vertex.id === vertexId)!.position
  const distance = (a: string, b: string) => {
    const p = position(a), q = position(b); return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)
  }
  if (mode === 'vertex') {
    const p = position(id); return `${id} · X ${length(p.x)}, Y ${length(p.y)}, Z ${length(p.z)}`
  }
  if (mode === 'edge' || mode === 'border') {
    const edge = mesh.edges.find(value => value.id === id); return edge ? `${id} · length ${length(distance(...edge.vertices))}` : ''
  }
  if (mode === 'polygon' || mode === 'element') {
    const face = mesh.faces.find(value => value.id === id)
    if (!face) return ''
    const ids = face.corners.map(corner => corner.vertexId), a = position(ids[0]); let area = 0
    for (let i = 1; i < ids.length - 1; i++) {
      const b = position(ids[i]), c = position(ids[i + 1])
      const u = [b.x - a.x, b.y - a.y, b.z - a.z], v = [c.x - a.x, c.y - a.y, c.z - a.z]
      area += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2
    }
    const squareUnits = area * fromModelMeters(1, measure) ** 2
    return `${id} · area ${Number(squareUnits.toFixed(4))} ${measure.unit}²`
  }
  return id
}
