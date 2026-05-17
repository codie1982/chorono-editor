// ── Scene Actions ─────────────────────────────────────────────────────────────

import type { ActionRegistry } from '../ActionRegistry'

export function registerSceneActions(reg: ActionRegistry): void {
  reg.register({
    id: 'scene.clear',
    toolName: 'clear_scene',
    description:
      'Remove all layers and timelines from the scene (fresh start). ' +
      'Use before generating a complete new animation from scratch.',
    parameters: {
      type: 'object',
      properties: {},
    },
    toCommand: (_params, scene) => ({
      label: 'AI: Clear Scene',
      execute: (s) => ({ ...s, layers: [], timelines: [] }),
      undo:    () => scene,
    }),
  })
}
