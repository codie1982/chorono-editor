import { pathToSvgString } from '@/lib/geometry/PathCommand'
import type { PathDefinition } from '@/lib/geometry/PathCommand'
import type { Vec2 } from '@/lib/geometry/CoordinateSystem'

/** Read-only world-space preview, outside renderer/export. Dashed exact curves
 * and square cut markers distinguish the future boundary from source geometry. */
export function SplineCornerOverlay({ result, label, zoom, width, height }: { result: { path: PathDefinition; markers: Vec2[] }; label: string; zoom: number; width: number; height: number }) {
  return <svg aria-label={label} className="absolute top-0 left-0 pointer-events-none" width={width * zoom} height={height * zoom} style={{ overflow: 'visible' }}>
    <g transform={`scale(${zoom})`}><path d={pathToSvgString(result.path)} fill="none" stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" />
      {result.markers.map((p, i) => <rect key={i} x={p.x - 3 / zoom} y={p.y - 3 / zoom} width={6 / zoom} height={6 / zoom} fill="#fbbf24" />)}</g>
  </svg>
}
