'use client'
import type { ChronoScene, Layer } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { splineTopologyCommand, type SplineTopologyAction } from '@/lib/editor/spline/topologyCommand'
import { attachSplineLayerCommand, detachSplineObjectsCommand } from '@/lib/editor/spline/transferCommand'
import type { SplineEditController } from './useSplineEditSelection'
import { copySplineTangents } from '@/lib/spline/edit/tangents'
import type { SplineTangentClipboard } from './useSplineTangentClipboard'
import { splineComponentTools, type SplineComponentTool } from './tools/splineComponentTools'

export type NativeSplineAction = SplineTopologyAction | { kind: 'attach'; sourceId: string } | { kind: 'detach' }
export interface SplineTopologyActions { perform(action: NativeSplineAction): void; canDetach: boolean; componentTools: SplineComponentTool[] }
/** Native UI orchestration shared by Properties and viewport menus. Reads fresh
 * source at activation, refuses stale inspector geometry, dispatches one command
 * and focuses result IDs only after React adopts the committed source. All
 * warnings belong to the host; no source mutation on a rejected action. */
export function useSplineTopologyActions(options: {
  layer?: Layer | null; controller: SplineEditController; getScene(): ChronoScene; dispatch(command: EditorCommand): void
  timeMs?: number; overrides?: OverrideMap; disabled?: boolean; isTransactionActive?(): boolean
  onSelectLayer?(id: string | null): void; warning(message: string): void
  clipboard?: SplineTangentClipboard
  pickedEdgeId?: string
}): SplineTopologyActions {
  const perform = (action: NativeSplineAction) => {
    const layer = options.layer
    if (!layer || options.disabled || options.isTransactionActive?.()) return
    try {
      const source = options.getScene()
      if (source.layers.find(item => item.id === layer.id)?.spline !== layer.spline) throw new Error('Spline changed. Select current elements again.')
      const prepared = action.kind === 'attach' ? attachSplineLayerCommand(source, layer.id, action.sourceId, options.timeMs, options.overrides)
        : action.kind === 'detach' ? detachSplineObjectsCommand(source, layer.id, options.controller.ids)
        : splineTopologyCommand(source, layer.id, options.controller.mode, action.kind === 'trim' || action.kind === 'extend' || action.kind === 'addVertex' ? [action.edgeId] : options.controller.ids, action, options.timeMs, options.overrides)
      if (action.kind === 'detach' && !options.onSelectLayer) throw new Error('This host cannot select a detached layer.')
      if (prepared.command) {
        options.dispatch(prepared.command)
        if (prepared.result.layerId !== layer.id) options.onSelectLayer?.(prepared.result.layerId)
        // The document selection owner outlives closing viewport menus.
        options.controller.focusResult({ ...prepared.result, ghosts: options.controller.sourceGhosts,
          attaching: options.controller.attaching, operation: options.controller.attachOperation, vertexType: options.controller.vertexType, simplifyTolerancePx: options.controller.simplifyTolerancePx,
          ...(action.kind === 'addVertex' && options.controller.edgeTool === 'addVertex' ? { edgeTool: 'addVertex' as const } : {}) })
      }
      options.warning('reason' in prepared.result ? prepared.result.reason ?? '' : '')
    } catch (error) { options.warning(error instanceof Error ? error.message : String(error)) }
  }
  const copy = () => {
    if (options.disabled || options.isTransactionActive?.()) return
    try {
      const data = options.getScene().layers.find(item => item.id === options.layer?.id)?.spline
      if (!data || data !== options.layer?.spline || options.controller.ids.length !== 1) throw new Error('Select one current point to Copy Tangents.')
      options.clipboard?.write(copySplineTangents(data, options.controller.ids[0])); options.warning('')
    } catch (error) { options.warning(error instanceof Error ? error.message : String(error)) }
  }
  return { canDetach: !!options.onSelectLayer, perform, componentTools: options.layer?.spline ? splineComponentTools({
    scene: options.getScene(), layer: options.layer, mode: options.controller.mode, ids: options.controller.ids,
    active: options.controller.active, disabled: options.disabled, busy: options.isTransactionActive?.(), clipboard: options.clipboard, perform, copy,
    edgeTool: options.controller.edgeTool, pickEdgeTool: tool => options.controller.setEdgeTool(options.controller.edgeTool === tool ? null : tool),
    pickedEdgeId: options.pickedEdgeId,
    simplifyTolerancePx: options.controller.simplifyTolerancePx,
  }) : [] }
}
