import type { ChronoScene, Layer } from '@/lib/types'
import type { SplineEditMode } from '@/lib/spline/selection'
import { editableSplineLayer, drivenSplineTopologyReason } from '@/lib/spline/edit/authoringGuard'

export type SplineToolId = 'chamfer' | 'fillet' | 'offset' | 'band'
interface PreviewTool {
  readonly active: boolean; readonly eligible: boolean; readonly disabled: boolean
  readonly selectionReason?: string; open(): void
}
export interface SplineToolAction {
  readonly id: SplineToolId; readonly label: string; readonly description: string
  readonly active: boolean; readonly disabled: boolean; readonly reason?: string; run(): void
}
const tools: readonly { id: SplineToolId; label: string; description: string; modes: readonly SplineEditMode[] }[] = [
  { id: 'chamfer', label: 'Chamfer', description: 'Cut selected corners along their adjacent curves.', modes: ['point'] },
  { id: 'fillet', label: 'Fillet', description: 'Round selected corners with tangent circular arcs.', modes: ['point'] },
  { id: 'band', label: 'Outline · Stroke to Path', description: 'Create real closed bands with caps, joins, dashes and holes.', modes: ['edge', 'object'] },
  { id: 'offset', label: 'Offset Path', description: 'Inset/outset closed contours or offset open contours.', modes: ['edge', 'object'] },
]

/** Shared panel/menu actions over the existing native preview controllers.
 * Eligibility, mode and live source ownership have one policy. Unsupported
 * selection remains visible with a reason, never promotes to the whole spline.
 * No own geometry, history, worker or persistent registry is introduced. */
export function splineEditTools(options: {
  mode: SplineEditMode; active: boolean; layer?: Layer | null; scene: ChronoScene
  controllers: Partial<Record<SplineToolId, PreviewTool>>; disabled?: boolean; busy?: boolean; onOpen?(): void
}): SplineToolAction[] {
  let blocked: string | undefined
  try {
    if (!options.layer || !options.active) throw new Error('Enter spline Edit mode first.')
    const layer = editableSplineLayer(options.scene, options.layer.id)
    blocked = drivenSplineTopologyReason(layer, options.scene) ?? undefined
  } catch (error) { blocked = error instanceof Error ? error.message : String(error) }
  if (options.disabled || options.busy) blocked = 'Finish the current gesture or preview before editing geometry.'
  const previewActive = Object.values(options.controllers).some(controller => controller?.active)
  return tools.filter(tool => tool.modes.includes(options.mode) && options.controllers[tool.id]).map(tool => {
    const controller = options.controllers[tool.id]!
    const reason = blocked ?? (previewActive && !controller.active ? 'Apply or cancel the active spline tool first.'
      : controller.disabled ? 'This spline tool is unavailable in the current context.'
        : !controller.eligible ? controller.selectionReason ?? 'Select suitable spline elements first.' : undefined)
    return { ...tool, active: controller.active, disabled: !!reason, reason,
      run() { if (!reason) { if (!controller.active) controller.open(); options.onOpen?.() } } }
  })
}

/** Shared presentation over unchanged portable point-type values. */
export const splinePointTypes = [
  { value: 'corner', label: 'Corner' }, { value: 'smooth', label: 'Smooth' },
  { value: 'bezier', label: 'Bézier (Mirror)' }, { value: 'bezierCorner', label: 'Bézier Corner' },
] as const
