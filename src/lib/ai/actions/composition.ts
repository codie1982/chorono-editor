// ── Composition Actions ───────────────────────────────────────────────────────

import type { ActionRegistry } from '../ActionRegistry'

interface UpdateCompositionParams {
  width?: number
  height?: number
  durationMs?: number
  frameRate?: number
  backgroundColor?: string
}

/** Register composition metadata updates without resizing layers or retiming their keyframes. */
export function registerCompositionActions(reg: ActionRegistry): void {
  reg.register<UpdateCompositionParams>({
    id: 'composition.update',
    toolName: 'update_composition',
    description: 'Change canvas size, composition duration, frame rate or background, preserving omitted settings. Does not rescale layers or retime keyframes/timelines. Use update_timeline for an individual animation duration, update_layer for geometry, or set_keyframes for motion.',
    parameters: {
      type: 'object',
      properties: {
        width:           { type: 'number', description: 'Canvas width in pixels, 1..8192. Larger canvases may exceed preview/export pixel budgets.' },
        height:          { type: 'number', description: 'Canvas height in pixels, 1..8192. Existing layer positions/sizes are unchanged.' },
        durationMs:      { type: 'number', description: 'Composition duration in milliseconds, 0..3,600,000. Does not change individual timeline durations.' },
        frameRate:       { type: 'number', description: 'Composition frames per second, 1..120; used as the default raster export rate, not a keyframe time unit.' },
        backgroundColor: { type: 'string', description: 'CSS hex color e.g. "#1a1a2e"' },
      },
    },
    toCommand: (p, scene) => {
      const prev = scene.composition
      const next = {
        ...prev,
        ...(p.width           != null ? { width:           p.width           } : {}),
        ...(p.height          != null ? { height:          p.height          } : {}),
        ...(p.durationMs      != null ? { durationMs:      p.durationMs      } : {}),
        ...(p.frameRate       != null ? { frameRate:       p.frameRate       } : {}),
        ...(p.backgroundColor          ? { backgroundColor: p.backgroundColor } : {}),
      }
      return {
        label: 'AI: Update Composition',
        execute: (s) => ({ ...s, composition: next }),
        undo:    (s) => ({ ...s, composition: prev }),
      }
    },
  })
}
