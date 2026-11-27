'use client'
import { useMemo, useState } from 'react'
import { prepareLiveSplineOutline } from '@/lib/editor/spline/band/liveOutlinePlan'
import { liveOutlineSelection } from '@/lib/spline/liveOutline/selection'
import { liveOutlineRecord } from '@/lib/spline/liveOutline/data'
import { makeBakeModifierStackCmd, makeToggleModifierCmd } from '@/lib/editor/modifiers/commands'
import { SplineBandWorkerClient } from '@/lib/spline/band/SplineBandWorkerClient'
import { defaultBandDraft } from '@/lib/spline/band/settingsFields'
import type { SplineBandRequest, SplineBandResult } from '@/lib/spline/band/types'
import { activeStrokeDash } from '@/lib/paint/strokeStyle'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { useSplineOperationPreview, type SplinePreviewContext } from '../preview/useSplineOperationPreview'
const executor = new SplineBandWorkerClient()

/** Native Outline borrows the canonical source-only preview transaction.
 * Settings/worker results are transient; selection/mode/time/document changes
 * cancel them. Width is local px; only the overlay is mapped to world space.
 * Apply is one Undo that creates/updates the existing live recipe. Source
 * geometry is retained; only explicit Bake replaces it by boundaries. */
export function useSplineBand(options: SplinePreviewContext & { executor?: { execute(request: SplineBandRequest, signal: AbortSignal): Promise<SplineBandResult> } }) {
  const { scene, controller } = options, idsKey = JSON.stringify(controller.ids)
  const layer = scene.layers.find(l => l.id === controller.layerId)
  const target = useMemo(() => {
    try {
      if (!controller.active || !layer?.spline) throw new Error('Choose Edge or Object edit mode.')
      return { chains: liveOutlineSelection(layer.spline, controller.mode, JSON.parse(idsKey)).chains }
    } catch (error) { return { reason: error instanceof Error ? error.message : String(error) } }
  }, [layer, controller.active, controller.mode, idsKey])
  const [settings, setSettings] = useState<Readonly<Record<string, unknown>>>(defaultBandDraft), [actionError, setActionError] = useState('')
  const liveRecord = liveOutlineRecord(layer)
  const adapter = options.executor ?? executor, execute = useMemo(() => adapter.execute.bind(adapter), [adapter])
  const previewSettings = settings
  const preview = useSplineOperationPreview({ ...options, settings: previewSettings, eligible: !!target.chains, focusMode: 'object', execute,
    prepare: () => prepareLiveSplineOutline(scene, controller.layerId!, controller.mode, JSON.parse(idsKey), settings) })
  const worldResult = useMemo(() => {
    if (!preview.result || !layer) return undefined
    const matrix = resolveLayerWorldMatrix(layer, scene, options.timeMs, options.overrides)
    return { ...preview.result, objects: preview.result.objects.map(o => ({ ...o, contours: o.contours.map(c => ({ ...c, points: c.points.map(p => matrix.applyToPoint(p)) })) })) }
  }, [preview.result, layer, scene, options.timeMs, options.overrides])
  const open = () => {
    if (options.disabled || !target.chains) return
    setActionError('')
    if (liveRecord) { setSettings(liveRecord.settings); preview.open(); return }
    const stroke = layer?.style?.stroke, dashes = activeStrokeDash(stroke)
    setSettings(previous => ({ ...previous, widthPx: stroke && stroke.width > 0 ? stroke.width : previous.widthPx,
      alignment: target.chains!.every(c => c.closed) ? stroke?.alignment ?? 'center' : 'center', cap: stroke?.lineCap ?? 'butt', join: stroke?.lineJoin ?? 'miter',
      dashEnabled: !!dashes.length, ...(dashes.length ? { dashSequence: dashes.join(' ') } : {}) })); preview.open()
  }
  /** Persisted enable/Bake commands are separate from the editor guide toggle. */
  const run = (bake: boolean, enabled = true) => {
    try {
      if (options.disabled || options.isTransactionActive() || options.documentSignal.aborted || !layer || !liveRecord) throw new Error('Finish the current gesture before changing Outline.')
      const source = options.getScene()
      options.dispatch(bake ? makeBakeModifierStackCmd(source, layer.id) : makeToggleModifierCmd(source, layer.id, liveRecord.id, enabled))
      if (bake) controller.focusResult({ layerId: layer.id, mode: 'object' })
      setActionError('')
    } catch (error) { setActionError(error instanceof Error ? error.message : String(error)) }
  }
  return { ...preview, open, settings, setSettings, worldResult, liveRecord, error: actionError || preview.error,
    setEnabled: (value: boolean) => run(false, value), bake: () => run(true),
    sourceGuideVisible: controller.sourceGuideVisible !== false, setSourceGuideVisible: (value: boolean) => controller.setSourceGuideVisible?.(value),
    eligible: !!target.chains, selectionReason: target.reason, chainCount: target.chains?.length ?? 0 }
}
export type SplineBandController = ReturnType<typeof useSplineBand>
