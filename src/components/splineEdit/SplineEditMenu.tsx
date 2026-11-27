'use client'
import type { Layer, ChronoScene } from '@/lib/types'
import type { SplinePick } from '@/lib/spline/selection'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { setSplinePointType, deleteSplinePoint, setSegmentType, setContourClosed, reverseContour } from '@/lib/spline'
import { splinePointTypes, type SplineToolAction } from './tools/splineEditTools'
import ContextMenu, { type MenuItem } from '../ui/ContextMenu'
import { splineEditCommand } from './commands'
import type { SplineEditController } from './useSplineEditSelection'
import { useSplineTopologyActions } from './useSplineTopologyActions'
import type { SplineTangentClipboard } from './useSplineTangentClipboard'
import type { OverrideMap } from '@/lib/evaluator'
import { splineVertexTypes } from './tools/splineVertexTypes'
import { splineInterpolationPresets } from './tools/splineInterpolationPresets'

/** Mode-local actions over current source. The native topology guard refuses
 * competing key/wire writers; menus never substitute root layer deletion. */
export function SplineEditMenu({ x, y, target, layer, controller, getScene, dispatch, warning, close, prefix = [], tools = [], tangentClipboard, timeMs, overrides, disabled, isTransactionActive }: {
  x: number; y: number; target: SplinePick | null; layer: Layer; controller: SplineEditController
  getScene(): ChronoScene; dispatch(command: EditorCommand): void; warning(message: string): void; close(): void; prefix?: MenuItem[]; tools?: readonly SplineToolAction[]
  tangentClipboard?: SplineTangentClipboard; timeMs?: number; overrides?: OverrideMap; disabled?: boolean; isTransactionActive?(): boolean
}) {
  const ids = controller.ids
  const topology = useSplineTopologyActions({ layer, controller, getScene, dispatch, warning, clipboard: tangentClipboard, timeMs, overrides, disabled, isTransactionActive, pickedEdgeId: target?.kind === 'edge' ? target.id : undefined })
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
      { kind: 'action', label: 'Convert to Bezier', onSelect: () => mutate(source => ids.reduce((next, id) => setSegmentType(next, id, 'cubic'), source)) })
  } else if (target?.kind === 'object' && controller.mode === 'object') {
    const contours = ids.flatMap(id => layer.spline?.subShapes[id]?.contourIds ?? [])
    const closed = contours.every(id => layer.spline?.contours[id]?.closed)
    items.push({ kind: 'action', label: closed ? 'Open contours' : 'Close contours', onSelect: () => mutate(source => contours.reduce((next, id) => setContourClosed(next, id, !closed), source)) },
      { kind: 'action', label: 'Reverse direction', onSelect: () => mutate(source => contours.reduce((next, id) => reverseContour(next, id), source)) })
  }
  items.push(...topology.componentTools.map(tool => tool.id === 'addVertex' ? { kind: 'submenu' as const, label: tool.label, disabled: tool.disabled,
    items: splineVertexTypes.map(choice => ({ kind: 'action' as const, label: choice.label, disabled: tool.disabled, disabledReason: tool.reason, onSelect: () => {
      controller.setVertexType(choice.value); controller.setEdgeTool('addVertex'); close()
    } })) } : tool.id === 'interpolation' ? { kind: 'submenu' as const, label: tool.label, disabled: tool.disabled,
      items: splineInterpolationPresets.map(choice => ({ kind: 'action' as const, label: choice.label, disabled: tool.disabled, disabledReason: tool.reason,
        onSelect: () => { tool.run({ tolerancePx: choice.value }); close() } })) } : { kind: 'action' as const, label: tool.label, disabled: tool.disabled, disabledReason: tool.reason,
    onSelect: () => { tool.run(target?.kind === 'edge' ? { edgeId: target.id, t: target.t ?? .5 } : undefined); close() } }))
  items.push(...tools.map(tool => ({ kind: 'action' as const, label: tool.label, disabled: tool.disabled, disabledReason: tool.reason, onSelect: () => { tool.run(); close() } })))
  if (items.length) items.push({ kind: 'separator' })
  items.push(...(['point', 'edge', 'object'] as const).map(mode => ({ kind: 'action' as const, label: `Edit spline ${mode}`, onSelect: () => { controller.enter(mode); close() } })),
    { kind: 'action', label: 'Done editing spline', onSelect: () => { controller.exit(); close() } })
  return <ContextMenu x={x} y={y} items={[...prefix, ...items]} onClose={close} />
}
