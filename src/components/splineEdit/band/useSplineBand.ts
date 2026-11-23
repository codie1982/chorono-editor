'use client'
import { useMemo, useState } from 'react'
import { prepareSplineBand } from '@/lib/editor/spline/band/bandPlan'
import { SplineBandWorkerClient } from '@/lib/spline/band/SplineBandWorkerClient'
import { bandSelection } from '@/lib/spline/band/selection'
import { defaultBandDraft, readBandDraft } from '@/lib/spline/band/settingsFields'
import type { SplineBandRequest, SplineBandResult } from '@/lib/spline/band/types'
import { activeStrokeDash } from '@/lib/paint/strokeStyle'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { useSplineOperationPreview, type SplinePreviewContext } from '../preview/useSplineOperationPreview'
const executor = new SplineBandWorkerClient()

/** Native Outline borrows the canonical source-only preview transaction.
 * Settings/worker results are transient; selection/mode/time/document changes
 * cancel them. Width is local px; only the overlay is mapped to world space.
 * Apply is one Undo, with no modifier row. Appearance stays in Properties. */
export function useSplineBand(options: SplinePreviewContext & { executor?: { execute(request: SplineBandRequest, signal: AbortSignal): Promise<SplineBandResult> } }) {
  const { scene, controller } = options, idsKey = JSON.stringify(controller.ids)
  const layer = scene.layers.find(l => l.id === controller.layerId)
  const target = useMemo(() => {
    try {
      if (!controller.active || !layer?.spline) throw new Error('Choose Edge or Object edit mode.')
      return { chains: bandSelection(layer.spline, controller.mode, JSON.parse(idsKey)) }
    } catch (error) { return { reason: error instanceof Error ? error.message : String(error) } }
  }, [layer, controller.active, controller.mode, idsKey])
  const [settings, setSettings] = useState<Readonly<Record<string, unknown>>>(defaultBandDraft), [keepSource, setKeepSource] = useState(false)
  const adapter = options.executor ?? executor, execute = useMemo(() => adapter.execute.bind(adapter), [adapter])
  const previewSettings = useMemo(() => ({ settings, keepSource }), [settings, keepSource])
  const preview = useSplineOperationPreview({ ...options, settings: previewSettings, eligible: !!target.chains, focusMode: 'object', execute,
    prepare: () => prepareSplineBand(scene, controller.layerId!, controller.mode, JSON.parse(idsKey), readBandDraft(settings), keepSource) })
  const worldResult = useMemo(() => {
    if (!preview.result || !layer) return undefined
    const matrix = resolveLayerWorldMatrix(layer, scene, options.timeMs, options.overrides)
    return { ...preview.result, objects: preview.result.objects.map(o => ({ ...o, contours: o.contours.map(c => ({ ...c, points: c.points.map(p => matrix.applyToPoint(p)) })) })) }
  }, [preview.result, layer, scene, options.timeMs, options.overrides])
  const open = () => {
    if (options.disabled || !target.chains) return
    const stroke = layer?.style?.stroke, dashes = activeStrokeDash(stroke)
    setSettings(previous => ({ ...previous, widthPx: stroke && stroke.width > 0 ? stroke.width : previous.widthPx,
      alignment: target.chains!.every(c => c.closed) ? stroke?.alignment ?? 'center' : 'center', cap: stroke?.lineCap ?? 'butt', join: stroke?.lineJoin ?? 'miter',
      dashEnabled: !!dashes.length, ...(dashes.length ? { dashSequence: dashes.join(' ') } : {}) })); preview.open()
  }
  return { ...preview, open, settings, setSettings, keepSource, setKeepSource, worldResult,
    eligible: !!target.chains, selectionReason: target.reason, chainCount: target.chains?.length ?? 0 }
}
export type SplineBandController = ReturnType<typeof useSplineBand>
