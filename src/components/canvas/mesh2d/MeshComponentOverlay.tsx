import type { MeshComponentMode, MeshComponentSelection } from '@/lib/geometry/mesh2d/selection/MeshComponentSelection'

/** Constant-CSS-size Mesh component markers. Aggregate paths avoid one DOM
 * element per edge/vertex on subdivided meshes. Presentation is never exported. */
export function MeshComponentOverlay({ model, mode, ids, zoom, pivot }: {
  model: MeshComponentSelection; mode: MeshComponentMode; ids: readonly string[]; zoom: number; pivot?: { x: number; y: number } | null
}) {
  const selected = new Set(ids), vertexIds = new Set(model.vertices(mode, ids))
  const faces = model.faces.filter(face => selected.has(face.id)).map(face => face.vertices.map((index, i) => {
    const p = model.points[index]; return `${i ? 'L' : 'M'}${p.x * zoom} ${p.y * zoom}`
  }).join(' ') + 'Z').join(' ')
  const edges = (onlySelected: boolean) => model.edges.filter(edge => !onlySelected || selected.has(edge.id)).map(edge => {
    const a = model.points[edge.a], b = model.points[edge.b]
    return `M${a.x * zoom} ${a.y * zoom}L${b.x * zoom} ${b.y * zoom}`
  }).join(' ')
  const points = (onlySelected: boolean) => model.points.filter(point => !onlySelected || vertexIds.has(point.id))
    .map(point => `M${point.x * zoom - 3} ${point.y * zoom - 3}h6v6h-6Z`).join(' ')
  return <svg role="img" aria-label={`Mesh ${mode} selection`} className="absolute inset-0 z-30 overflow-visible pointer-events-none">
    {mode === 'face' && <path data-mesh-selected-faces d={faces} fill="#ef4444" fillOpacity={.18} stroke="#ef4444" strokeWidth={2} />}
    <path d={edges(false)} fill="none" stroke="#fdba74" strokeWidth={1} opacity={.65} />
    {mode === 'edge' && <path data-mesh-selected-edges d={edges(true)} fill="none" stroke="#ef4444" strokeWidth={3} />}
    <path data-mesh-vertices d={points(false)} fill="#f1f0e9" stroke="#c2410c" strokeWidth={1} />
    <path data-mesh-selected-points d={points(true)} fill="#ef4444" stroke="#fff" strokeWidth={1} />
    {pivot && <g aria-label="Edit pivot" transform={`translate(${pivot.x * zoom} ${pivot.y * zoom})`}>
      <circle r={5} fill="#27272a" stroke="#fb923c" strokeWidth={1.5} />
      <path d="M-7 0H7M0-7V7" stroke="#fb923c" />
    </g>}
  </svg>
}
