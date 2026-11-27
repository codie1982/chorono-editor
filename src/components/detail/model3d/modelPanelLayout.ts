import type { DockNode } from '@/components/dock/types'
import type { ModelWorkspace } from './modelWorkspaces'

export const MODEL_PANEL_STORAGE_KEY = 'chorono.model3d.panels.v2'
export const MODEL_PANEL_IDS = ['explorer', 'viewport', 'properties', 'timeline'] as const
export const REQUIRED_MODEL_PANELS = ['explorer', 'viewport'] as const

/** Initial 3D arrangement: one object tree at left, viewport in the middle,
 * and object properties at right. This is view state, not scene data. */
export function createModelPanelLayout(workspace: ModelWorkspace = 'modeling'): DockNode {
  const main: DockNode = { kind: 'split', id: 'model-root', direction: 'h', ratio: .19, children: [
    { kind: 'leaf', id: 'model-explorer', panels: ['explorer'], activeIndex: 0 },
    { kind: 'split', id: 'model-center', direction: 'h', ratio: .72, children: [
      { kind: 'leaf', id: 'model-viewport', panels: ['viewport'], activeIndex: 0 },
      { kind: 'leaf', id: 'model-properties', panels: ['properties'], activeIndex: 0 },
    ] },
  ] }
  return workspace === 'animation'
    ? { kind: 'split', id: 'model-animation-root', direction: 'v', ratio: .4, children: [
      main, { kind: 'leaf', id: 'model-timeline', panels: ['timeline'], activeIndex: 0 },
    ] }
    : main
}
