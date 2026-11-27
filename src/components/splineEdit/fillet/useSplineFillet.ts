'use client'
import { useMemo, useState } from 'react'
import { prepareSplineFillet } from '@/lib/editor/spline/fillet/filletPlan'
import { FilletWorkerClient, FILLET_LIMITS, type FilletExecutor, type FilletSettings } from '@/lib/spline/fillet'
import { selectSplineCorners } from '@/lib/spline/corners'
import { useSplineOperationPreview, type SplinePreviewContext } from '../preview/useSplineOperationPreview'

const executor = new FilletWorkerClient()
/** Point-only adapter over the shared preview lifecycle. The domain rejects
 * open endpoints, locked/driven geometry and intersecting/overlapping cuts.
 * New cut points remain selected after Apply; no main-thread geometry fallback. */
export function useSplineFillet(options: SplinePreviewContext & { executor?: FilletExecutor }) {
  const { scene, controller, timeMs, overrides } = options, idsKey = JSON.stringify(controller.ids), layerId = controller.layerId
  const target = useMemo(() => {
    try {
      const layer = scene.layers.find(item => item.id === layerId)
      if (!controller.active || controller.mode !== 'point' || !layer?.spline) throw new Error('Select spline points in Point mode.')
      return { ids: selectSplineCorners(layer.spline, JSON.parse(idsKey), 'Fillet', FILLET_LIMITS.points) }
    } catch (error) { return { reason: error instanceof Error ? error.message : String(error) } }
  }, [scene, layerId, controller.active, controller.mode, idsKey])
  const [settings, setSettings] = useState<FilletSettings>({ radiusPx: 10 })
  const adapter = options.executor ?? executor, execute = useMemo(() => adapter.execute.bind(adapter), [adapter])
  const preview = useSplineOperationPreview({ ...options, settings, eligible: !!target.ids, focusMode: 'point', execute,
    prepare: () => prepareSplineFillet(scene, layerId!, JSON.parse(idsKey), settings, timeMs, overrides) })
  return { ...preview, eligible: !!target.ids, selectionReason: target.reason, pointCount: target.ids?.length ?? 0, settings, setSettings }
}
export type SplineFilletController = ReturnType<typeof useSplineFillet>
