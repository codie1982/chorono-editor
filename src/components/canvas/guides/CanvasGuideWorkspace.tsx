import type { RefObject } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { Rulers } from '../overlays/Rulers'
import { useCanvasGuideEditing } from './useCanvasGuideEditing'
import { useViewportCursor } from './useViewportCursor'
import { useCanvasViewportMetrics } from './useCanvasViewportMetrics'
import { GuideInspector } from './GuideInspector'

export interface CanvasGuideWorkspaceProps {
  scene: ChronoScene
  editor: EditorStateReturn
  canvasRef: RefObject<HTMLCanvasElement>
  containerEl: HTMLDivElement
  composition: { width: number; height: number }
  zoom: number
  pan: { x: number; y: number }
  selectedRect?: { x: number; y: number; width: number; height: number }
  showRulers: boolean
  showGuides: boolean
  enabled: boolean
  onWarning?: (message: string) => void
}

/** Composition-aware editor chrome for persisted guides and cursor rulers.
 * Mount outside the zoomed artboard wrapper: positions convert through the
 * actual canvas CSS rectangle into viewport-relative pixels. Guides extend
 * through the work area, retain precise source positions, and never enter the
 * scene renderer/export. The guide hook owns transactions; object selection is
 * deliberately untouched by line/inspector events. Global visibility is local
 * viewport state; per-guide hidden/locked flags are portable source data.
 * The pointer marker stays 12 CSS pixels through pan/zoom. It is decorative,
 * hit-transparent editor chrome and is never submitted to a scene renderer. */
export function CanvasGuideWorkspace(props: CanvasGuideWorkspaceProps) {
  const { canvasRef, containerEl, composition, zoom, pan, selectedRect, showRulers, showGuides, enabled } = props
  const editing = useCanvasGuideEditing(props)
  const cursor = useViewportCursor(containerEl, canvasRef, enabled && showRulers, `${zoom}:${pan.x}:${pan.y}`)
  const frame = useCanvasViewportMetrics(containerEl, canvasRef.current, composition, zoom, pan)
  const sx = cursor ? frame.originX + cursor.x * frame.scaleX : 0
  const sy = cursor ? frame.originY + cursor.y * frame.scaleY : 0
  return <>
    {cursor && <div data-testid="canvas-cursor-crosshair" data-x={cursor.x} data-y={cursor.y} className="absolute inset-0 pointer-events-none z-10">
      <div className="absolute top-[18px] bottom-0 border-l border-cyan-300/35" style={{ left: sx }} />
      <div className="absolute left-[18px] right-0 border-t border-cyan-300/35" style={{ top: sy }} />
      <svg data-testid="canvas-cursor-point" aria-hidden="true" width={12} height={12} viewBox="0 0 12 12"
        className="absolute pointer-events-none overflow-visible" style={{ left: sx, top: sy, transform: 'translate(-50%, -50%)' }}>
        <circle cx={6} cy={6} r={4.25} fill="#0f172a" stroke="#67e8f9" strokeWidth={1.25} />
        <circle cx={6} cy={6} r={1.5} fill="#ecfeff" />
      </svg>
    </div>}
    {showGuides && enabled && editing.guides.filter(guide => !guide.hidden).map(guide => {
      const vertical = guide.axis === 'v'
      const position = vertical ? frame.originX + guide.position * frame.scaleX : frame.originY + guide.position * frame.scaleY
      if (position < 18 || position > (vertical ? frame.width : frame.height)) return null
      return <button key={guide.id} data-testid={`guide-line-${guide.id}`} data-guide-id={guide.id} data-locked={!!guide.locked}
        aria-label={`${vertical ? 'Vertical' : 'Horizontal'} guide at ${guide.position} px`}
        title={`${vertical ? 'X' : 'Y'} ${guide.position.toFixed(2)} px${guide.locked ? ' · locked' : ' · drag to move'}`}
        className="absolute z-[15] group outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        style={vertical ? { left: position - 4, width: 8, top: 18, bottom: 0, cursor: guide.locked ? 'pointer' : 'col-resize' }
          : { top: position - 4, height: 8, left: 18, right: 0, cursor: guide.locked ? 'pointer' : 'row-resize' }}
        onPointerDown={event => editing.begin(guide.axis, event, guide)}
        onClick={event => { event.stopPropagation(); editing.select(guide.id); editing.setOpen(true) }}
        onKeyDown={event => {
          event.stopPropagation()
          if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); editing.remove(guide) }
          if (!guide.locked && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault(); const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
            editing.update(guide, { position: guide.position + direction * (event.shiftKey ? 10 : 1) })
          }
        }}>
        <span className={`absolute pointer-events-none ${editing.selectedId === guide.id ? 'bg-cyan-200' : 'bg-cyan-400/65'} group-hover:bg-cyan-100`}
          style={vertical ? { left: 3, width: 1, top: 0, bottom: 0 } : { top: 3, height: 1, left: 0, right: 0 }} />
      </button>
    })}
    {showRulers && <Rulers composition={composition} zoom={zoom} pan={pan} containerEl={containerEl} canvasEl={canvasRef.current} metrics={frame}
      selectedRect={selectedRect} cursor={cursor} onBeginGuide={enabled ? editing.begin : undefined}
      onCreateGuide={enabled ? editing.add : undefined} onManageGuides={enabled ? () => editing.setOpen(value => !value) : undefined} />}
    {enabled && editing.open && <GuideInspector editing={editing} />}
    {enabled && !editing.open && editing.error && <div role="alert" className="absolute top-7 left-7 z-50 bg-slate-950 p-2 text-xs text-amber-200">{editing.error}</div>}
  </>
}
