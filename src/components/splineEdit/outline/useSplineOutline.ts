'use client'
import { useMemo, useState } from 'react'
import { outlineSelection, prepareSplineOutline } from '@/lib/editor/spline/outline/outlinePlan'
import { OutlineWorkerClient, type OutlineExecutor, type OutlineSettings } from '@/lib/spline/outline'
import { useSplineOperationPreview, type SplinePreviewContext } from '../preview/useSplineOperationPreview'

const executor = new OutlineWorkerClient()
interface Options extends SplinePreviewContext { executor?: OutlineExecutor }

/** Page-owned preview state, borrowed by the existing dock and viewport. Preview
 * never touches scene/history; source/time/selection/document changes invalidate
 * it immediately and terminate its job. Settings changes abort superseded jobs.
 * Apply appends through one guarded native command, then focuses new Objects.
 * No result/worker survives Cancel, context exit or unmount. */
export function useSplineOutline(options: Options) {
  const { scene, controller, timeMs, overrides } = options
  const idsKey = JSON.stringify(controller.ids), layerId = controller.layerId
  const target = useMemo(() => {
    try {
      const layer = scene.layers.find(item => item.id === layerId)
      if (!controller.active || !layer?.spline) throw new Error('Choose Edge or Object edit mode.')
      return { selection: outlineSelection(layer.spline, controller.mode, JSON.parse(idsKey)) }
    } catch (error) { return { reason: error instanceof Error ? error.message : String(error) } }
  }, [scene, layerId, controller.active, controller.mode, idsKey])
  const [settings, setSettings] = useState<OutlineSettings>({ distancePx: 20, side: 'left', join: 'miter', miterLimit: 4, tolerancePx: .25 })
  const adapter = options.executor ?? executor
  const execute = useMemo(() => adapter.execute.bind(adapter), [adapter])
  const preview = useSplineOperationPreview({ ...options, settings, eligible: !!target.selection, focusMode: 'object', execute,
    prepare: () => prepareSplineOutline(scene, layerId!, controller.mode, JSON.parse(idsKey), settings, timeMs, overrides) })
  /** Direction depends on contour kind; settings survive Cancel. */
  const open = () => {
    if (options.disabled || !target.selection) return
    setSettings(previous => ({ ...previous, side: target.selection!.closed ? 'inside' : 'left' })); preview.open()
  }
  return { ...preview, open, eligible: !!target.selection, selectionReason: target.reason, closed: target.selection?.closed,
    contourCount: target.selection?.contourCount ?? 0, settings, setSettings }
}
export type SplineOutlineController = ReturnType<typeof useSplineOutline>
