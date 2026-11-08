import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { TrajectoryNode } from '@/lib/timeline/trajectory'
import { createTrajectoryKeyIdAllocator, moveTrajectoryNodes } from '@/lib/timeline/trajectory/commands'
import { applyAxisLock } from '@/lib/canvas/math/moveMath'
import { trajectoryNodeRef } from './types'
import { MotionKeyDragSession } from './MotionKeyDragSession'

interface Options {
  editor: EditorStateReturn
  timelineId: string
  layerId: string
  canvasRef?: RefObject<HTMLCanvasElement>
  contextKey: string
  documentSignal: AbortSignal
  onSelect: (ids: Set<string>) => void
  onWarning: (message: string) => void
  snapWorldPoint?: (point: { x: number; y: number }) => { x: number; y: number }
}

/** Convert a native client pointer to the current canvas composition pixels.
 * The canvas rect already includes pan/zoom/layout; DPR is never multiplied. */
export function motionPointerWorld(canvas: HTMLCanvasElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) throw new Error('The canvas has no visible editing area.')
  return { x: (clientX - rect.left) * canvas.width / rect.width, y: (clientY - rect.top) * canvas.height / rect.height }
}

/** React adapter for paired/sparse native key dragging. Commands sample the
 * same borrowed source baseline; only the final command commits. Local seek is
 * deliberately absent from contextKey so selecting a node can seek and drag in
 * one gesture. Scope/mode change and unmount cancel through the shared owner. */
export function useMotionKeyDrag(options: Options) {
  const latest = useRef(options); latest.current = options
  const session = useRef<MotionKeyDragSession | null>(null)
  useEffect(() => () => { session.current?.cancel(); session.current = null }, [options.contextKey, options.documentSignal])
  const begin = useCallback((event: React.PointerEvent<SVGGElement>, nodes: readonly TrajectoryNode[]) => {
    const current = latest.current, canvas = current.canvasRef?.current
    if (event.button !== 0 || !canvas || !nodes.length || session.current || current.editor.isTransactionActive()) return
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus?.()
    const origin = motionPointerWorld(canvas, event.clientX, event.clientY)
    const keyId = createTrajectoryKeyIdAllocator()
    const refs = nodes.map(trajectoryNodeRef), { timelineId, layerId } = current
    current.editor.beginTransaction()
    session.current = new MotionKeyDragSession({ startClientX: event.clientX, startClientY: event.clientY }, {
      getEditor: () => latest.current.editor, eventTarget: window,
      preview: (base, sample) => {
        const point = motionPointerWorld(canvas, sample.clientX, sample.clientY)
        let delta = applyAxisLock(point.x - origin.x, point.y - origin.y, null, sample.shiftKey)
        if (latest.current.snapWorldPoint) {
          const snapped = latest.current.snapWorldPoint({ x: nodes[0].world.x + delta.dx, y: nodes[0].world.y + delta.dy })
          delta = applyAxisLock(snapped.x - nodes[0].world.x, snapped.y - nodes[0].world.y, null, sample.shiftKey)
        }
        const result = moveTrajectoryNodes(base, { timelineId, layerId, nodes: refs, deltaWorld: { x: delta.dx, y: delta.dy }, keyId })
        return { ...result, scene: result.command ? result.command.execute(base) : base }
      },
      show: () => {},
      commit: (_base, preview) => {
        if (!preview.command) return
        latest.current.editor.commitTransaction(preview.command)
        latest.current.onSelect(new Set(preview.selectedIds))
        if (preview.diagnostics.length) latest.current.onWarning(preview.diagnostics.join(' '))
      },
      clear: () => { session.current = null }, warning: message => latest.current.onWarning(message),
    // Sparse-axis filling changes the node's key pair/React identity. Capture
    // the stable native canvas, never a diamond that preview may replace.
    }, { pointerId: event.pointerId, currentTarget: canvas })
  }, [])
  return { begin, cancel: () => session.current?.cancel() }
}
