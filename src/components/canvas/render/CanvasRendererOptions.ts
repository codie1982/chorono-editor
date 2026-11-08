import type { RefObject } from 'react'
import type { ChronoScene, Timeline } from '@/lib/types'
import type { TimelineGhostSettings } from '@/lib/types/editor'
import type { AssetElementMap } from '@/lib/renderer'
import type { OverrideMap } from '@/lib/evaluator'

export interface CanvasRendererOptions {
  /** Clipping viewport; its CSS pan/zoom is separate from the Canvas matrix. */
  viewportRef?: RefObject<HTMLDivElement>
  viewportKey?: string
  /** CSS viewport scale; absent means full-detail rendering. */
  viewportScale?: number
  scene: ChronoScene
  timeMs: number
  selectedLayerId: string | null
  selectedLayerIds?: Set<string>
  assets: AssetElementMap
  /** Master snap enabled (controls whether the grid is drawn). */
  snapEnabled: boolean
  snapToGridOn: boolean
  gridSize: number
  /** Timeline / runtime override map (already merged upstream). */
  overrides?: OverrideMap
  paramValues?: Map<string, string | number | boolean>
  /** Live drag override so the dragged layer follows the cursor even when keyframed. */
  dragOverrides: Map<string, number>
  ghostSettings?: TimelineGhostSettings
  selectedTimeline?: Timeline | null
  /**
   * BL-66 — when true (playback or preview mode), the renderer skips editor
   * chrome (selection outlines, grid) so the frame shows pure content.
   */
  hideEditorUI?: boolean
}

