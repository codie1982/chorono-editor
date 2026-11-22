'use client'
import type { Layer, ChronoScene } from '@/lib/types'
import type { SplinePick } from '@/lib/spline/selection'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { setSplinePointType, deleteSplinePoint, setSegmentType, insertPointOnSegment, setContourClosed, reverseContour } from '@/lib/spline'
import { splinePointTypes, type SplineToolAction } from './tools/splineEditTools'
import ContextMenu, { type MenuItem } from '../ui/ContextMenu'
import { splineEditCommand } from './commands'
import type { SplineEditController } from './useSplineEditSelection'

/** Mode-local actions over current source. The native topology guard refuses
 * competing key/wire writers; menus never substitute root layer deletion. */
export function SplineEditMenu({ x, y, target, layer, controller, getScene, dispatch, warning, close, prefix = [], tools = [] }: {
  x: number; y: number; target: SplinePick | null; layer: Layer; controller: SplineEditController
  getScene(): ChronoScene; dispatch(command: EditorCommand): void; warning(message: string): void; close(): void; prefix?: MenuItem[]; tools?: readonly SplineToolAction[]
}) {
  const ids = controller.ids
  const mutate = (fn: Parameters<typeof splineEditCommand>[3]) => {
    try { const command = splineEditCommand(getScene(), layer.id, { kind: 'topology' }, fn); if (command) dispatch(command) }
    catch (error) { warning(error instanceof Error ? error.message : String(error)) }
    close()
  }
  const items: MenuItem[] = []
  if (target && controller.mode === 'point') {
    for (const {label, value: type} of splinePointTypes)
      items.push({ kind: 'action', label, onSelect: () => mutate(source => ids.reduce((next, id) => setSplinePointType(next, id, type), source)) })
    items.push({ kind: 'action', label: 'Delete selected points', onSelect: () => mutate(source => ids.reduce((next, id) => deleteSplinePoint(next, id), source)) })
  } else if (target?.kind === 'edge' && controller.mode === 'edge') {
    items.push({ kind: 'action', label: 'Convert to Line', onSelect: () => mutate(source => ids.reduce((next, id) => setSegmentType(next, id, 'line'), source)) },
      { kind: 'action', label: 'Convert to Bezier', onSelect: () => mutate(source => ids.reduce((next, id) => setSegmentType(next, id, 'cubic'), source)) },
      { kind: 'action', label: 'Insert Point', onSelect: () => mutate(source => insertPointOnSegment(source, target.id, target.t ?? .5)) })
  } else if (target?.kind === 'object' && controller.mode === 'object') {
    const contours = ids.flatMap(id => layer.spline?.subShapes[id]?.contourIds ?? [])
    const closed = contours.every(id => layer.spline?.contours[id]?.closed)
    items.push({ kind: 'action', label: closed ? 'Open contours' : 'Close contours', onSelect: () => mutate(source => contours.reduce((next, id) => setContourClosed(next, id, !closed), source)) },
      { kind: 'action', label: 'Reverse direction', onSelect: () => mutate(source => contours.reduce((next, id) => reverseContour(next, id), source)) })
  }
  items.push(...tools.map(tool => ({ kind: 'action' as const, label: tool.label, disabled: tool.disabled, disabledReason: tool.reason, onSelect: () => { tool.run(); close() } })))
  if (items.length) items.push({ kind: 'separator' })
  items.push(...(['point', 'edge', 'object'] as const).map(mode => ({ kind: 'action' as const, label: `Edit spline ${mode}`, onSelect: () => { controller.enter(mode); close() } })),
    { kind: 'action', label: 'Done editing spline', onSelect: () => { controller.exit(); close() } })
  return <ContextMenu x={x} y={y} items={[...prefix, ...items]} onClose={close} />
}
