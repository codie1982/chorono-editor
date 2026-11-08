import type { RefObject } from 'react'
import type { ArrayAuthoringController } from './useArrayAuthoring'
import { arrayHandlePoints, arraySettingsFromHandle } from './arrayHandleGeometry'
import { useArrayHandles } from './useArrayHandles'

/** World-space, transient array outlines and step/grid/center handles. The SVG
 * lives in the same zoomed composition wrapper as the native canvas. It never
 * renders a second source scene or changes editor history; unsupported/dense
 * cases remain diagnostics in the controls. */
export function ArrayViewportOverlay({ authoring, canvasRef, zoom }: {
  authoring: ArrayAuthoringController; canvasRef: RefObject<HTMLCanvasElement>; zoom: number
}) {
  const drag = useArrayHandles(authoring, canvasRef)
  const plan = authoring.plan
  if (!authoring.active || !plan) return null
  const handles = arrayHandlePoints(authoring.settings, plan.reference)
  const pivot = plan.reference.pivotWorld
  return <svg data-array-preview aria-label="Array viewport preview" className="pointer-events-none absolute inset-0 z-50 overflow-visible" width="100%" height="100%">
    {plan.preview.outlines.map((outline, index) => <polygon key={index} data-array-occurrence={outline.occurrenceIndex} data-array-root={outline.rootId}
      points={outline.points.map(point => `${point.x * zoom},${point.y * zoom}`).join(' ')} fill="rgba(59,130,246,0.08)"
      stroke="#60a5fa" strokeWidth={1.5} strokeDasharray="5 3" />)}
    <path d={`M${pivot.x * zoom - 7},${pivot.y * zoom}h14M${pivot.x * zoom},${pivot.y * zoom - 7}v14`} stroke="#fde047" strokeWidth={2} />
    {handles.map(handle => <g key={handle.kind} role="button" tabIndex={0} aria-label={handle.label}
      data-array-handle={handle.kind} transform={`translate(${handle.world.x * zoom} ${handle.world.y * zoom})`}
      style={{ pointerEvents: 'all', cursor: 'move' }} onPointerDown={event => drag.begin(event, handle)}
      onKeyDown={event => {
        const deltas: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
        const delta = deltas[event.key]; if (!delta) return
        event.preventDefault(); event.stopPropagation(); const amount = event.shiftKey ? 10 : 1
        authoring.setSettings(arraySettingsFromHandle(authoring.settings, plan.reference, handle.kind,
          { x: handle.world.x + delta[0] * amount, y: handle.world.y + delta[1] * amount }))
      }}><title>{handle.label} · drag or use arrows; Shift = axis lock / 10px</title><circle r={14} fill="transparent" />
      <circle r={6} fill="#1e3a8a" stroke="#fde047" strokeWidth={2} /><path d="M-3,0h6M0,-3v6" stroke="white" /></g>)}
    {drag.warning && <text x={8} y={18} fill="#fca5a5" fontSize={12}>{drag.warning}</text>}
  </svg>
}
