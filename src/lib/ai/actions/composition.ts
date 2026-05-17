// ── Composition Actions ───────────────────────────────────────────────────────

import type { ActionRegistry } from '../ActionRegistry'

interface UpdateCompositionParams {
  width?: number
  height?: number
  durationMs?: number
  frameRate?: number
  backgroundColor?: string
}

export function registerCompositionActions(reg: ActionRegistry): void {
  reg.register<UpdateCompositionParams>({
    id: 'composition.update',
    toolName: 'update_composition',
    description: 'Change canvas composition settings (size, duration, framerate, background color).',
    parameters: {
      type: 'object',
      properties: {
        width:           { type: 'number', description: 'Canvas width in px' },
        height:          { type: 'number', description: 'Canvas height in px' },
        durationMs:      { type: 'number', description: 'Total duration in milliseconds' },
        frameRate:       { type: 'number', description: 'Frames per second (24, 30, 60)' },
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
