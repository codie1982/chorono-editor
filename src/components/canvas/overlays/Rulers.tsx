import { useEffect, useState } from 'react'
import { canvasViewportMetrics, type CanvasViewportMetrics } from '../guides/canvasViewportMetrics'

interface RulersProps {
  composition: { width: number; height: number }
  zoom: number
  pan: { x: number; y: number }
  containerEl: HTMLDivElement
  canvasEl?: HTMLCanvasElement | null
  metrics?: CanvasViewportMetrics
  selectedRect?: { x: number; y: number; width: number; height: number }
  cursor?: { x: number; y: number } | null
  onBeginGuide?: (axis: 'v' | 'h', event: React.PointerEvent<HTMLElement>) => void
  onCreateGuide?: (axis: 'v' | 'h', position: number) => void
  onManageGuides?: () => void
}

const THICK = 18

/** Select a composition-pixel step so major labels are roughly 80 CSS pixels
 * apart. This is a display policy only; guide positions remain unrounded. */
function rulerStep(scale: number): number {
  return [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find(value => value >= 80 / Math.max(.001, scale)) ?? 5000
}

/** Render event-driven x/y scales with selected extents and cursor markers.
 * New pointer/keyboard guide callbacks are optional, preserving legacy read-only
 * callers. Clicking/dragging the x scale creates a vertical line at that x;
 * the y scale creates a horizontal line at y. Enter creates at the scale center,
 * and the guide inspector provides exact numeric positioning. No render loop or
 * source mutation is owned here; ResizeObserver is disconnected on unmount. */
export function Rulers({ composition, zoom, pan, containerEl, canvasEl, metrics, selectedRect, cursor,
  onBeginGuide, onCreateGuide, onManageGuides }: RulersProps) {
  const [, resized] = useState(0)
  useEffect(() => {
    if (metrics) return
    const observer = new ResizeObserver(() => resized(value => value + 1))
    observer.observe(containerEl)
    return () => observer.disconnect()
  }, [containerEl, metrics])
  const frame = metrics ?? canvasViewportMetrics(containerEl, composition, zoom, pan, canvasEl)
  const { originX, originY, scaleX, scaleY } = frame
  const axes = [{ axis: 'v' as const, horizontal: true, length: composition.width, origin: originX, scale: scaleX, screenLength: frame.width },
    { axis: 'h' as const, horizontal: false, length: composition.height, origin: originY, scale: scaleY, screenLength: frame.height }]
  const selectedLines = selectedRect ? [originX + selectedRect.x * scaleX, originX + (selectedRect.x + selectedRect.width) * scaleX,
    originY + selectedRect.y * scaleY, originY + (selectedRect.y + selectedRect.height) * scaleY] : []
  return <>
    {axes.map(track => {
      const ticks: number[] = [], step = rulerStep(track.scale)
      for (let value = 0; value <= track.length; value += step) ticks.push(value)
      const low = selectedRect ? track.horizontal ? selectedRect.x : selectedRect.y : 0
      const high = low + (selectedRect ? track.horizontal ? selectedRect.width : selectedRect.height : 0)
      const bandStart = Math.max(THICK, track.origin + low * track.scale)
      const bandEnd = Math.min(track.screenLength, track.origin + high * track.scale)
      const marker = cursor ? track.origin + (track.horizontal ? cursor.x : cursor.y) * track.scale : null
      return <div key={track.axis} role={onBeginGuide ? 'button' : undefined} tabIndex={onBeginGuide ? 0 : undefined}
        aria-label={track.horizontal ? 'Horizontal ruler' : 'Vertical ruler'}
        title={`Click or drag the ${track.horizontal ? 'x' : 'y'} ruler to add a ${track.horizontal ? 'vertical' : 'horizontal'} guide. Enter adds at the ruler center.`}
        className={`absolute top-0 left-0 bg-gray-900/95 border-gray-700 z-20 outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${track.horizontal ? 'right-0 border-b' : 'bottom-0 border-r'}`}
        style={{ height: track.horizontal ? THICK : undefined, width: track.horizontal ? undefined : THICK,
          pointerEvents: onBeginGuide ? 'auto' : 'none', cursor: onBeginGuide ? track.horizontal ? 'col-resize' : 'row-resize' : undefined }}
        onPointerDown={event => { if (event.button === 0) onBeginGuide?.(track.axis, event) }}
        onKeyDown={event => {
          event.stopPropagation()
          if (event.key === 'Enter') { event.preventDefault(); onCreateGuide?.(track.axis, track.length / 2) }
          if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.blur() }
        }}>
        {selectedRect && bandEnd > bandStart && <div className="absolute bg-blue-500/40 pointer-events-none"
          style={track.horizontal ? { left: bandStart, width: bandEnd - bandStart, bottom: 0, height: 6 }
            : { top: bandStart, height: bandEnd - bandStart, right: 0, width: 6 }} />}
        {ticks.map(value => {
          const screen = track.origin + value * track.scale
          if (screen < THICK || screen > track.screenLength) return null
          return <div key={value} className="absolute pointer-events-none" style={track.horizontal ? { left: screen, top: 0, height: '100%' } : { top: screen, left: 0, width: '100%' }}>
            <div className="absolute bg-gray-500" style={track.horizontal ? { bottom: 0, width: 1, height: 6 } : { right: 0, width: 6, height: 1 }} />
            <span className="absolute text-[9px] font-mono text-gray-400 whitespace-nowrap select-none"
              style={track.horizontal ? { top: 2, left: 3 } : { top: 0, left: 2, transform: 'rotate(-90deg) translate(-100%, 100%)', transformOrigin: '0 0' }}>{value}</span>
          </div>
        })}
        {marker !== null && marker >= THICK && marker <= track.screenLength && <div data-testid={track.horizontal ? 'ruler-cursor-x' : 'ruler-cursor-y'}
          className="absolute bg-cyan-300 pointer-events-none" style={track.horizontal ? { left: marker, top: 0, bottom: 0, width: 2 } : { top: marker, left: 0, right: 0, height: 2 }} />}
      </div>
    })}
    {onManageGuides && <button aria-label="Manage guides" title="Add and manage guides" onPointerDown={event => event.stopPropagation()}
      onClick={onManageGuides} className="absolute top-0 left-0 z-30 bg-gray-800 text-cyan-200 text-[10px] focus-visible:ring-2 focus-visible:ring-cyan-300"
      style={{ width: THICK, height: THICK }}>+</button>}
    {!!selectedLines.length && <div className="absolute inset-0 pointer-events-none z-10">
      {selectedLines.map((position, index) => position >= THICK && position <= (index < 2 ? frame.width : frame.height)
        ? <div key={index} className="absolute border-dashed border-blue-400/30" style={index < 2
          ? { left: position, top: THICK, bottom: 0, borderLeftWidth: 1 }
          : { top: position, left: THICK, right: 0, borderTopWidth: 1 }} /> : null)}
    </div>}
  </>
}
