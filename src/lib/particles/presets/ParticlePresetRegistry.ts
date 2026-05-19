// ── Particle Preset Registry ───────────────────────────────────────────────────
//
// A preset wraps a full ParticleEmitterData + metadata for the preset browser.
// Presets are imported by newParticleEmitterLayer() in defaults.ts.

import type { ParticleEmitterData } from '../types'

export type PresetCategory =
  | 'confetti' | 'sparkle' | 'smoke' | 'fire'
  | 'weather'  | 'trail'   | 'magic' | 'ui'

export interface ParticlePresetDefinition {
  id:          string
  name:        string
  category:    PresetCategory
  description: string
  /** Search tags */
  tags:        string[]
  /** True if maxParticles ≤ 120 and blur disabled (safe on mid-range mobile) */
  mobileSafe:  boolean
  complexity:  'low' | 'medium' | 'high'
  /** Returns a deep-cloneable default config (no live references) */
  createData:  () => ParticleEmitterData
}

// ── Registry ─────────────────────────────────────────────────────────────────

const presets: Map<string, ParticlePresetDefinition> = new Map()

export function registerParticlePreset(def: ParticlePresetDefinition): void {
  presets.set(def.id, def)
}

export function getParticlePreset(id: string): ParticlePresetDefinition | undefined {
  return presets.get(id)
}

export function getAllParticlePresets(): ParticlePresetDefinition[] {
  return Array.from(presets.values())
}

// ── Lazy export: PARTICLE_PRESETS ─────────────────────────────────────────────
// Import this AFTER bootstrap so presets are registered.

export const PARTICLE_PRESETS: ParticlePresetDefinition[] = new Proxy([] as ParticlePresetDefinition[], {
  get(_, prop) {
    const arr = getAllParticlePresets()
    if (prop === 'find')   return arr.find.bind(arr)
    if (prop === 'filter') return arr.filter.bind(arr)
    if (prop === 'length') return arr.length
    if (prop === Symbol.iterator) return arr[Symbol.iterator].bind(arr)
    return (arr as any)[prop]
  },
})
