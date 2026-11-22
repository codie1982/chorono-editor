import { pathToSvgString, M, L, Z } from '@/lib/geometry/PathCommand'
import type { OutlineResult } from '@/lib/spline/outline'

/** Transient world-space boundary overlay. No fill and fixed CSS stroke make
 * open output visible without altering source paint or exported pixels. */
export function SplineOutlineOverlay({ result, zoom, width, height }: { result: OutlineResult; zoom: number; width: number; height: number }) {
  const commands = result.objects.flatMap(object => object.contours.flatMap(contour => [M(contour.points[0].x, contour.points[0].y), ...contour.points.slice(1).map(p => L(p.x, p.y)), ...(contour.closed ? [Z()] : [])]))
  return <svg aria-label="Spline Offset preview" className="absolute top-0 left-0 pointer-events-none" width={width * zoom} height={height * zoom} style={{ overflow: 'visible' }}>
    <g transform={`scale(${zoom})`}><path d={pathToSvgString({ commands, closed: false })} fill="none" stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" /></g>
  </svg>
}
