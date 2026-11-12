import { useEffect, useId, useMemo, type RefObject, type CSSProperties } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { LayerWorldBoundsResolver } from '@/lib/geometry/resolveLayerWorldBounds'
import { prepareOffArtboardOutlines } from '@/lib/canvas/math/offArtboardOutlines'
import { useCanvasViewportMetrics } from '../guides/useCanvasViewportMetrics'

export interface OffArtboardOverlayProps {
  scene: ChronoScene
  selectedIds: ReadonlySet<string>
  boundsFor: LayerWorldBoundsResolver
  composition: { width: number; height: number }
  zoom: number
  pan: { x: number; y: number }
  containerEl: HTMLDivElement
  canvasRef: RefObject<HTMLCanvasElement>
  onLayerPointerDown: (id: string, event: React.PointerEvent<SVGRectElement>) => void
  onDiagnostics?: (message: string) => void
  /** Parent interaction policy keeps pan distinct from shape selection. */
  cursor?: CSSProperties['cursor']
}

/** Dashed, hit-testable AABB proxies in the visible work area outside the white
 * composition. Mount inside the same zoomed artboard wrapper as native canvas.
 * An even-odd clip excludes all pixels/hit areas inside the artboard, preserving
 * the renderer's existing image and selection workflow. SVG strokes keep CSS
 * pixel widths through zoom. The component never paints an export surface.
 *
 * Root integration must capture a stable native canvas for moves; this SVG rect
 * may disappear when its object returns fully inside. Pointer-down delegates
 * selection/transform meaning and does not create another command or transaction.
 * Frame mapping comes from committed DOM rectangles, including pan/zoom/resize.
 */
export function OffArtboardOverlay(props: OffArtboardOverlayProps) {
  const { scene, selectedIds, boundsFor, composition, zoom, pan, containerEl, canvasRef } = props
  const frame = useCanvasViewportMetrics(containerEl, canvasRef.current, composition, zoom, pan)
  const viewport = useMemo(() => ({ x: -frame.originX / frame.scaleX, y: -frame.originY / frame.scaleY,
    width: frame.width / frame.scaleX, height: frame.height / frame.scaleY }), [frame])
  const plan = useMemo(() => prepareOffArtboardOutlines(scene, selectedIds, boundsFor, composition, viewport),
    [scene, selectedIds, boundsFor, composition.width, composition.height, viewport])
  const clipId = `outside-artboard-${useId().replace(/:/g, '')}`
  const diagnostic = plan.diagnostics.join(' ')
  useEffect(() => { props.onDiagnostics?.(diagnostic) }, [props.onDiagnostics, diagnostic])
  // Selected descendants must remain hit-testable above an unselected root
  // proxy; preparation order prioritizes them for the finite query budget.
  const paintedOutlines = [...plan.outlines].sort((a, b) => Number(a.selected) - Number(b.selected))
  if (![viewport.x, viewport.y, viewport.width, viewport.height].every(Number.isFinite)
      || viewport.width <= 0 || viewport.height <= 0) return null
  const rectPath = (x: number, y: number, w: number, h: number) => `M${x},${y}h${w}v${h}h${-w}Z`
  return <svg data-off-artboard-outlines data-outline-truncated={plan.truncated} aria-label="Off-artboard objects"
    className="absolute pointer-events-none z-[5]" width={viewport.width * zoom} height={viewport.height * zoom}
    viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
    style={{ left: viewport.x * zoom, top: viewport.y * zoom, overflow: 'hidden' }}>
    <defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse"><path clipRule="evenodd" fillRule="evenodd"
      d={`${rectPath(viewport.x, viewport.y, viewport.width, viewport.height)} ${rectPath(0, 0, composition.width, composition.height)}`} /></clipPath></defs>
    <g clipPath={`url(#${clipId})`}>
      {paintedOutlines.map(outline => <rect key={outline.id} data-off-artboard-id={outline.id}
        x={outline.bounds.x} y={outline.bounds.y} width={Math.max(outline.bounds.width, 1 / zoom)} height={Math.max(outline.bounds.height, 1 / zoom)}
        fill="transparent" stroke={outline.selected ? '#93c5fd' : '#94a3b8'} strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: 'all', cursor: props.cursor ?? 'crosshair' }} onPointerDown={event => props.onLayerPointerDown(outline.id, event)}>
        <title>{outline.name} · outside composition</title>
      </rect>)}
    </g>
  </svg>
}
