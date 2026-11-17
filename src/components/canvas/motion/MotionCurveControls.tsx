import ContextMenu from '@/components/ui/ContextMenu'
import { trajectoryCurveHandles, type TrajectoryModel, type TrajectoryNode, type TrajectorySample } from '@/lib/timeline/trajectory'
import type { useMotionCurveEditing } from './useMotionCurveEditing'

/** SVG-only path hit regions, segment feedback and control lines. Menus portal
 * through the existing ContextMenu; no HTML tool window covers the canvas.
 * Fixed CSS hit widths are achieved by the caller's composition zoom mapping. */
export function MotionCurveControls({ model, lines, selected, zoom, enabled, editing }: {
  model: TrajectoryModel; lines: TrajectorySample[][]; selected: readonly TrajectoryNode[]; zoom: number; enabled: boolean
  editing: ReturnType<typeof useMotionCurveEditing>
}) {
  const hover = editing.hover
  return <>
    {enabled && lines.map((samples, i) => <polyline key={i} points={samples.map(sample => `${sample.world.x * zoom},${sample.world.y * zoom}`).join(' ')}
      data-motion-segment-hit="true" fill="none" stroke="transparent" strokeWidth={14} pointerEvents="stroke" style={{ cursor: 'crosshair' }}
      onPointerMove={editing.move} onPointerLeave={editing.clearHover} onContextMenu={event => editing.context(event)} />)}
    {enabled && hover && lines.map((samples, i) => <polyline key={i} data-motion-segment-highlight="true"
      points={samples.filter(sample => sample.timeMs >= hover.startMs && sample.timeMs <= hover.endMs).map(sample => `${sample.world.x * zoom},${sample.world.y * zoom}`).join(' ')}
      fill="none" stroke="#38bdf8" strokeWidth={4} pointerEvents="none" />)}
    {model.context && selected.flatMap(node => trajectoryCurveHandles(model.context!, node.timeMs).map(handle => <g key={`${node.timeMs}:${handle.side}`}>
      <line x1={node.world.x * zoom} y1={node.world.y * zoom} x2={handle.world.x * zoom} y2={handle.world.y * zoom} stroke="#fbbf24" strokeWidth={1.5} pointerEvents="none" />
      <circle data-motion-handle={handle.side} data-motion-handle-time={node.timeMs} cx={handle.world.x * zoom} cy={handle.world.y * zoom} r={6}
        fill="#0f172a" stroke="#fbbf24" strokeWidth={2} role="button" aria-label={`${handle.side === 'out' ? 'Outgoing' : 'Incoming'} motion handle at ${node.timeMs} milliseconds`}
        aria-disabled={!enabled} pointerEvents={enabled ? 'all' : 'none'} style={{ cursor: 'crosshair' }}
        onPointerDown={event => editing.beginHandle(event, handle)}><title>Drag {handle.side === 'out' ? 'outgoing' : 'incoming'} Bezier control</title></circle>
    </g>))}
    {editing.menu && <ContextMenu x={editing.menu.x} y={editing.menu.y} items={editing.items} onClose={editing.closeMenu} />}
  </>
}
