import type { ActionRegistry } from '../ActionRegistry'
import type { ChronoScene } from '@/lib/types'

/**
 * Remove authored animation content while preserving the reusable project shell.
 *
 * Composition settings, imported assets, asset collections and editor guides
 * remain available for the next animation. Layer/timeline dependants are reset
 * together so a fresh scene cannot retain orphaned physics ownership, runtime
 * graphs or attribution for objects that no longer exist. The returned scene is
 * a new immutable value; callers retain the original for exact Undo.
 */
export function clearAuthoredSceneContent(scene: ChronoScene): ChronoScene {
  return {
    ...scene,
    layers: [],
    timelines: [],
    parameters: [],
    triggers: [],
    bindings: [],
    parameterWires: [],
    stateMachines: [],
    initialState: {},
    physics: undefined,
    authoring: undefined,
  }
}

export function registerSceneActions(reg: ActionRegistry): void {
  reg.register({
    id: 'scene.clear',
    toolName: 'clear_scene',
    description:
      'Remove authored layers, timelines and their dependent simulation/runtime metadata for a fresh start. ' +
      'Preserves composition settings, reusable assets, collections and editor guides.',
    parameters: {
      type: 'object',
      properties: {},
    },
    toCommand: (_params, scene) => ({
      label: 'AI: Clear Scene',
      execute: clearAuthoredSceneContent,
      undo:    () => scene,
    }),
  })
}
