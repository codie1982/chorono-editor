'use client'
import { useEffect, useState } from 'react'
import type { ChronoScene, Layer } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { splineTopologyCommand, type SplineTopologyAction, type SplineTopologyResult } from '@/lib/editor/spline/topologyCommand'
import { attachSplineLayerCommand, detachSplineObjectsCommand } from '@/lib/editor/spline/transferCommand'
import type { SplineEditController } from './useSplineEditSelection'

export type NativeSplineAction = SplineTopologyAction | { kind: 'attach'; sourceId: string } | { kind: 'detach' }
export interface SplineTopologyActions { perform(action: NativeSplineAction): void; canDetach: boolean }
/** Native UI orchestration shared by Properties and viewport menus. Reads fresh
 * source at activation, refuses stale inspector geometry, dispatches one command
 * and focuses result IDs only after React adopts the committed source. All
 * warnings belong to the host; no source mutation on a rejected action. */
export function useSplineTopologyActions(options: {
  layer?: Layer | null; controller: SplineEditController; getScene(): ChronoScene; dispatch(command: EditorCommand): void
  timeMs?: number; overrides?: OverrideMap; disabled?: boolean; isTransactionActive?(): boolean
  onSelectLayer?(id: string | null): void; warning(message: string): void
}): SplineTopologyActions {
  const [pending, setPending] = useState<SplineTopologyResult | null>(null)
  useEffect(() => {
    if (!pending) return
    if (pending.layerId === options.controller.layerId) options.controller.enter(pending.mode, pending.ids)
    setPending(null)
  }, [pending, options.layer?.spline, options.controller.layerId, options.controller.enter])
  return { canDetach: !!options.onSelectLayer, perform: action => {
    const layer = options.layer
    if (!layer || options.disabled || options.isTransactionActive?.()) return
    try {
      const source = options.getScene()
      if (source.layers.find(item => item.id === layer.id)?.spline !== layer.spline) throw new Error('Spline changed. Select current elements again.')
      const prepared = action.kind === 'attach' ? attachSplineLayerCommand(source, layer.id, action.sourceId, options.timeMs, options.overrides)
        : action.kind === 'detach' ? detachSplineObjectsCommand(source, layer.id, options.controller.ids)
        : splineTopologyCommand(source, layer.id, options.controller.mode, options.controller.ids, action, options.timeMs, options.overrides)
      if (action.kind === 'detach' && !options.onSelectLayer) throw new Error('This host cannot select a detached layer.')
      if (prepared.command) {
        options.dispatch(prepared.command)
        if (prepared.result.layerId !== layer.id) options.onSelectLayer?.(prepared.result.layerId)
        setPending(prepared.result)
      }
      options.warning('')
    } catch (error) { options.warning(error instanceof Error ? error.message : String(error)) }
  } }
}
