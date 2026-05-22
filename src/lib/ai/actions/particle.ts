// ── Particle Actions (BL-13 AI surface) ───────────────────────────────────────
// Preset-first emitter creation. The LLM picks a preset by friendly name and
// optionally overrides count / duration / loop / position — far more reliable
// than asking it to fill the deep nested ParticleEmitterData by hand.

import { errorCmd } from './_shared'
import { buildEmitterLayer } from '@/lib/particles/buildEmitterLayer'
import { makeAddLayerCmd } from '@/lib/editor/commands-layer'
import type { ActionRegistry } from '../ActionRegistry'

const PRESET_ENUM = ['confetti', 'sparkle', 'magic', 'smoke', 'fire', 'snow', 'rain', 'rocket']

interface AddEmitterParams {
  id: string
  name?: string
  x?: number
  y?: number
  preset?: string
  count?: number
  durationMs?: number
  loop?: boolean
}

export function registerParticleActions(reg: ActionRegistry): void {
  reg.register<AddEmitterParams>({
    id: 'particle.add',
    toolName: 'add_particle_emitter',
    description:
      'Add a particle emitter. Pick a preset by friendly name — confetti, sparkle, ' +
      'magic, smoke, fire, snow, rain, rocket — then optionally override count / ' +
      'durationMs / loop / position. Use for "confetti", "fireworks", "falling snow", etc.',
    parameters: {
      type: 'object',
      required: ['id'],
      properties: {
        id:         { type: 'string', description: 'Unique layer id e.g. "confetti_1"' },
        name:       { type: 'string', description: 'Display name' },
        x:          { type: 'number', description: 'Emitter X position in px' },
        y:          { type: 'number', description: 'Emitter Y position in px' },
        preset:     { type: 'string', enum: PRESET_ENUM, description: 'Particle preset' },
        count:      { type: 'number', description: 'Max simultaneous particles' },
        durationMs: { type: 'number', description: 'Emitter run time in ms' },
        loop:       { type: 'boolean', description: 'Repeat continuously' },
      },
    },
    toCommand: (p, scene) => {
      if (!p.id) return errorCmd('add_particle_emitter missing id')
      if (scene.layers.some((l) => l.id === p.id)) {
        return errorCmd(`layer id "${p.id}" already exists — choose a different id`)
      }
      const layer = buildEmitterLayer({
        id: p.id, name: p.name ?? p.id,
        x: p.x, y: p.y, preset: p.preset,
        count: p.count, durationMs: p.durationMs, loop: p.loop,
      })
      return makeAddLayerCmd(layer)
    },
  })
}

