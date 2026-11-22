import { pathToSvgString } from '@/lib/geometry'
import type { BooleanResult } from '@/lib/geometry/boolean'

/** Read-only editor overlay in composition space; never part of CanvasRenderer
 * or its exported pixels. Constant CSS-pixel boundary width under pan/zoom. */
export function BooleanPreviewOverlay({ result, zoom, width, height }: { result: BooleanResult; zoom: number; width: number; height: number }) {
  return <svg aria-label="Boolean result preview" className="absolute top-0 left-0 pointer-events-none" width={width * zoom} height={height * zoom} style={{ overflow: 'visible' }}>
    <g transform={`scale(${zoom})`}><path d={pathToSvgString(result.path)} fill="rgba(192,132,252,0.65)" fillRule="nonzero" stroke="#d8b4fe" strokeWidth={2} vectorEffect="non-scaling-stroke" /></g>
  </svg>
}
