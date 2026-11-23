import type { ChronoScene, Layer } from '@/lib/types'
import type { SplineEditMode } from '@/lib/spline/selection'
import { splineBreakReason } from '@/lib/spline/topology'
import { editableSplineLayer, drivenSplineTopologyReason } from '@/lib/spline/edit/authoringGuard'
import type { SplineTopologyAction } from '@/lib/editor/spline/topologyCommand'
import type { SplineTangentClipboard } from '../useSplineTangentClipboard'
import { splineExtendEndpoint } from '@/lib/spline/topology/edgeBoundaries'
import type { SplineEdgePickTool } from '../useSplineEditSelection'

export interface SplineComponentTool {
  id: 'break' | 'fuse' | 'resetTangents' | 'copyTangents' | 'pasteTangents' | 'split' | 'simplify' | 'smooth' | SplineEdgePickTool
  label: string; description: string; reason?: string; disabled: boolean
  active?: boolean
  run(options?: { t?: number; edgeId?: string }): void
}
const definitions: (Omit<SplineComponentTool, 'run' | 'reason' | 'disabled'> & { mode: SplineEditMode })[] = [
  { id: 'break', mode: 'point', label: 'Break', description: 'Separate at selected points without moving the curves.' },
  { id: 'fuse', mode: 'point', label: 'Fuse', description: 'Move points to their common center; keep their connections separate.' },
  { id: 'resetTangents', mode: 'point', label: 'Reset Tangents', description: 'Rebuild handles from neighboring points using each point’s type.' },
  { id: 'copyTangents', mode: 'point', label: 'Copy Tangents', description: 'Copy one point’s local handle offsets and connection type.' },
  { id: 'pasteTangents', mode: 'point', label: 'Paste Tangents', description: 'Apply copied handles/type without moving selected anchors.' },
  { id: 'split', mode: 'edge', label: 'Split', description: 'Cut selected edges at an interior position, preserving their curves.' },
  { id: 'addVertex', mode: 'edge', label: 'Add Vertex', description: 'Keep clicking edges to add vertices. Choose the new vertex type; Esc exits.' },
  { id: 'trim', mode: 'edge', label: 'Trim', description: 'Click the part between intersections to remove it. Other visible splines can act as boundaries.' },
  { id: 'extend', mode: 'edge', label: 'Extend', description: 'Click a terminal edge near its open end to extend its tangent to the nearest forward boundary.' },
  { id: 'simplify', mode: 'object', label: 'Simplify', description: 'Reduce redundant anchors within the chosen local-pixel tolerance, preserving sharp corners and holes.' },
  { id: 'smooth', mode: 'object', label: 'Smooth', description: 'Rebuild smooth tangents without moving any anchor points.' },
]
/** One mode/availability catalog for panel and menu. Copy is read-only; all
 * mutations share native topology ownership guards. Missing selection never
 * expands to the whole spline. Click-time commands revalidate live source. */
export function splineComponentTools(options: {
  scene: ChronoScene; layer: Layer; mode: SplineEditMode; ids: readonly string[]; active: boolean; disabled?: boolean; busy?: boolean
  clipboard?: SplineTangentClipboard; perform(action: SplineTopologyAction): void; copy(): void
  edgeTool?: SplineEdgePickTool | null; pickEdgeTool?(tool: SplineEdgePickTool): void
  pickedEdgeId?: string
  simplifyTolerancePx?: number
}): SplineComponentTool[] {
  const { layer, ids, clipboard } = options
  let guard: string | undefined
  try { editableSplineLayer(options.scene, layer.id) } catch (error) { guard = error instanceof Error ? error.message : String(error) }
  const writer = drivenSplineTopologyReason(layer, options.scene) ?? undefined
  const family = options.mode === 'point' ? layer.spline!.points : options.mode === 'edge' ? layer.spline!.segments : layer.spline!.subShapes
  return definitions.filter(tool => tool.mode === options.mode).map(tool => {
    const picking = tool.id === 'trim' || tool.id === 'extend' || tool.id === 'addVertex'
    let extendReason: string | undefined
    const extendIds = options.pickedEdgeId ? [options.pickedEdgeId] : ids
    if (tool.id === 'extend' && extendIds.length && !extendIds.some(id => { try { splineExtendEndpoint(layer.spline!, id); return true } catch { return false } })) extendReason = 'Select a terminal edge of an open contour to Extend.'
    if (tool.id === 'extend' && !extendIds.length && !Object.values(layer.spline!.contours).some(contour => !contour.closed)) extendReason = 'Extend needs an open contour.'
    const reason = !options.active ? 'Enter spline Edit mode first.' : options.disabled || options.busy ? 'Finish the current operation before using this tool.' : guard
      ?? (tool.id === 'copyTangents' ? undefined : writer)
      ?? (!ids.length && !picking ? `Select ${options.mode === 'point' ? 'points' : options.mode === 'edge' ? 'edges' : 'Objects'} first.` : undefined)
      ?? (ids.some(id => !Object.hasOwn(family, id)) ? 'Select current spline elements again.' : undefined)
      ?? (tool.id === 'break' ? splineBreakReason(layer.spline!, ids) : undefined)
      ?? (tool.id === 'fuse' && ids.length < 2 ? 'Select at least two points to Fuse.' : undefined)
      ?? (tool.id === 'copyTangents' && (ids.length !== 1 || !clipboard) ? 'Select exactly one point to Copy Tangents.' : undefined)
      ?? (tool.id === 'pasteTangents' && !clipboard?.value ? 'Copy Tangents from one point first.' : undefined)
      ?? extendReason
    return { ...tool, reason, disabled: !!reason, active: options.edgeTool === tool.id, run: settings => {
      if (reason) return
      if (tool.id === 'copyTangents') options.copy()
      else if (tool.id === 'pasteTangents') options.perform({ kind: 'pasteTangents', tangents: clipboard!.value! })
      else if (tool.id === 'split') options.perform({ kind: 'split', ...settings })
      else if (tool.id === 'addVertex') options.pickEdgeTool?.('addVertex')
      else if (tool.id === 'simplify') options.perform({ kind: 'simplify', tolerancePx: options.simplifyTolerancePx ?? .5 })
      else if (tool.id === 'trim' || tool.id === 'extend') {
        if (settings?.edgeId && settings.t !== undefined) options.perform({ kind: tool.id, edgeId: settings.edgeId, t: settings.t })
        else options.pickEdgeTool?.(tool.id)
      }
      else options.perform({ kind: tool.id })
    } }
  })
}
