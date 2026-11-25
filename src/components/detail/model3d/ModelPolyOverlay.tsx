'use client'
import type { MeshSnapshot } from '@/lib/model3d/modeling/poly/meshSnapshot'
import type { PolyEditSelection, PolyProjection } from '@/lib/model3d/modeling/poly/editSelection'

/** Pointer-transparent logical mesh overlay. Render triangulation diagonals
 * are not shown as editable edges; only the current selection is emphasized. */
export function ModelPolyOverlay({ mesh, projection, selection, width, height }: {
  mesh: MeshSnapshot; projection: PolyProjection | null; selection: PolyEditSelection; width: number; height: number
}) {
  if (!projection || selection.mode === 'object') return null
  const visible = new Set(projection.visibleFaces), selected = new Set(selection.ids)
  const visibleVertices = new Set(mesh.faces.filter(face => visible.has(face.id)).flatMap(face => face.corners.map(corner => corner.vertexId)))
  const visibleEdges = new Set(mesh.edges.filter(edge => edge.halfEdgeIds.some(id => {
    const faceId = mesh.halfEdges.find(half => half.id === id)?.faceId
    return !!faceId && visible.has(faceId)
  })).map(edge => edge.id))
  const faceSelected = selection.mode === 'polygon' || selection.mode === 'element'
  const edgeSelected = selection.mode === 'edge' || selection.mode === 'border'
  return <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-[3] h-full w-full" viewBox={`0 0 ${width} ${height}`}>
    {mesh.faces.filter(face => visible.has(face.id)).map(face => <polygon key={face.id}
      points={face.corners.map(corner => { const p = projection.vertices[corner.vertexId]; return `${p.x},${p.y}` }).join(' ')}
      fill={faceSelected && selected.has(face.id) ? '#fb923c55' : 'none'} stroke="#67e8f955" strokeWidth="1" />)}
    {(edgeSelected ? mesh.edges.filter(edge => visibleEdges.has(edge.id)) : []).map(edge => {
      const a = projection.vertices[edge.vertices[0]], b = projection.vertices[edge.vertices[1]]
      return <line key={edge.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        stroke={selected.has(edge.id) ? '#fb923c' : '#67e8f9aa'} strokeWidth={selected.has(edge.id) ? 4 : 1.5} />
    })}
    {selection.mode === 'vertex' && mesh.vertices.map(vertex => {
      const p = projection.vertices[vertex.id]
      if (!visibleVertices.has(vertex.id) || p.depth < -1 || p.depth > 1) return null
      return <circle key={vertex.id} cx={p.x} cy={p.y} r={selected.has(vertex.id) ? 6 : 3.5}
        fill={selected.has(vertex.id) ? '#fb923c' : '#67e8f9'} stroke="#08111e" strokeWidth="1.5" />
    })}
  </svg>
}
