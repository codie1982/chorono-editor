// ── Emitter layer builder ─────────────────────────────────────────────────────
// Shared by the AI tool (add_particle_emitter) and the script API
// (scene.addEmitter). Starts from a valid default emitter layer, optionally
// swaps in a named preset's full config, then applies light overrides.

import type { Layer } from '../types'
import { newParticleEmitterLayer } from '../defaults'
import { getParticlePreset } from './presets'
import './presets' // side-effect: register built-in presets

/** Friendly name → registered preset id. */
const PRESET_ALIASES: Record<string, string> = {
  confetti: 'confettiBurst',
  sparkle:  'successSparkles', sparkles: 'successSparkles', success: 'successSparkles',
  magic:    'magicDust', dust: 'magicDust',
  smoke:    'smokePuff',
  fire:     'fireFame', flame: 'fireFame',
  snow:     'snowFall',
  rain:     'rainLines',
  rocket:   'rocketTrail', trail: 'rocketTrail',
}

/** Resolve a preset id or friendly alias to a registered preset id, or undefined. */
export function resolveParticlePresetId(name?: string): string | undefined {
  if (!name) return undefined
  if (getParticlePreset(name)) return name
  const alias = PRESET_ALIASES[name.toLowerCase()]
  return alias && getParticlePreset(alias) ? alias : undefined
}

export interface EmitterLayerOptions {
  id?:         string
  name?:       string
  x?:          number
  y?:          number
  preset?:     string
  /** Max simultaneous particles (also sets burstCount / ratePerSecond). */
  count?:      number
  durationMs?: number
  loop?:       boolean
}

export function buildEmitterLayer(opts: EmitterLayerOptions = {}): Layer {
  const layer = newParticleEmitterLayer()
  if (opts.id)   layer.id = opts.id
  if (opts.name) layer.name = opts.name
  if (opts.x != null || opts.y != null) {
    layer.transform = {
      ...layer.transform,
      ...(opts.x != null ? { x: opts.x } : {}),
      ...(opts.y != null ? { y: opts.y } : {}),
    }
  }

  const presetId = resolveParticlePresetId(opts.preset)
  if (presetId) layer.particleEmitter = getParticlePreset(presetId)!.createData()

  const pe = layer.particleEmitter
  if (pe) {
    if (opts.count != null) {
      pe.emitter.maxParticles = opts.count
      if (pe.emitter.mode === 'burst') pe.emitter.burstCount = opts.count
      else pe.emitter.ratePerSecond = opts.count
    }
    if (opts.durationMs != null) pe.emitter.durationMs = opts.durationMs
    if (opts.loop       != null) pe.emitter.loop = opts.loop
  }
  return layer
}
