import type { ChronoScene, Layer } from '@/lib/types'
import type { SplineEditMode } from '@/lib/spline/selection'
import { splineBreakReason } from '@/lib/spline/topology'
import { editableSplineLayer, drivenSplineTopologyReason } from '@/lib/spline/edit/authoringGuard'
import type { SplineTopologyAction } from '@/lib/editor/spline/topologyCommand'
import type { SplineTangentClipboard } from '../useSplineTangentClipboard'

export interface SplineComponentTool {
  id: 'break' | 'fuse' | 'resetTangents' | 'copyTangents' | 'pasteTangents' | 'split'
  label: string; description: string; reason?: string; disabled: boolean
  run(options?: { t?: number; edgeId?: string }): void
}
const definitions: Omit<SplineComponentTool, 'run' | 'reason' | 'disabled'>[] = [
  { id: 'break', label: 'Break', description: 'Separate at selected points without moving the curves.' },
  { id: 'fuse', label: 'Fuse', description: 'Move points to their common center; keep their connections separate.' },
  { id: 'resetTangents', label: 'Reset Tangents', description: 'Rebuild handles from neighboring points using each point’s type.' },
  { id: 'copyTangents', label: 'Copy Tangents', description: 'Copy one point’s local handle offsets and connection type.' },
  { id: 'pasteTangents', label: 'Paste Tangents', description: 'Apply copied handles/type without moving selected anchors.' },
  { id: 'split', label: 'Split', description: 'Cut selected edges at an interior position, preserving their curves.' },
]
/** One mode/availability catalog for panel and menu. Copy is read-only; all
 * mutations share native topology ownership guards. Missing selection never
 * expands to the whole spline. Click-time commands revalidate live source. */
export function splineComponentTools(options: {
  scene: ChronoScene; layer: Layer; mode: SplineEditMode; ids: readonly string[]; active: boolean; disabled?: boolean; busy?: boolean
  clipboard?: SplineTangentClipboard; perform(action: SplineTopologyAction): void; copy(): void
}): SplineComponentTool[] {
  const { layer, ids, clipboard } = options
  let guard: string | undefined
  try { editableSplineLayer(options.scene, layer.id) } catch (error) { guard = error instanceof Error ? error.message : String(error) }
  const writer = drivenSplineTopologyReason(layer, options.scene) ?? undefined
  return definitions.filter(tool => options.mode === 'point' ? tool.id !== 'split' : options.mode === 'edge' && tool.id === 'split').map(tool => {
    const reason = !options.active ? 'Enter spline Edit mode first.' : options.disabled || options.busy ? 'Finish the current operation before using this tool.' : guard
      ?? (tool.id === 'copyTangents' ? undefined : writer)
      ?? (!ids.length ? `Select ${options.mode === 'point' ? 'points' : 'edges'} first.` : undefined)
      ?? (ids.some(id => !Object.hasOwn(options.mode === 'point' ? layer.spline!.points : layer.spline!.segments, id)) ? 'Select current spline elements again.' : undefined)
      ?? (tool.id === 'break' ? splineBreakReason(layer.spline!, ids) : undefined)
      ?? (tool.id === 'fuse' && ids.length < 2 ? 'Select at least two points to Fuse.' : undefined)
      ?? (tool.id === 'copyTangents' && (ids.length !== 1 || !clipboard) ? 'Select exactly one point to Copy Tangents.' : undefined)
      ?? (tool.id === 'pasteTangents' && !clipboard?.value ? 'Copy Tangents from one point first.' : undefined)
    return { ...tool, reason, disabled: !!reason, run: settings => {
      if (reason) return
      if (tool.id === 'copyTangents') options.copy()
      else if (tool.id === 'pasteTangents') options.perform({ kind: 'pasteTangents', tangents: clipboard!.value! })
      else if (tool.id === 'split') options.perform({ kind: 'split', ...settings })
      else options.perform({ kind: tool.id })
    } }
  })
}
