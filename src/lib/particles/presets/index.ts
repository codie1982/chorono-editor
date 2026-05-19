// ── Particle Presets barrel ────────────────────────────────────────────────────
// Importing this module registers all built-in presets as a side-effect.
// bootstrap.ts imports this to ensure presets are available at startup.

export { registerParticlePreset, getParticlePreset, getAllParticlePresets, PARTICLE_PRESETS } from './ParticlePresetRegistry'
export type { ParticlePresetDefinition, PresetCategory } from './ParticlePresetRegistry'

// Side-effect imports — each file calls registerParticlePreset()
import './ConfettiPreset'
import './SparklePreset'
import './MagicDustPreset'
import './SmokePreset'
import './FirePreset'
import './SnowPreset'
import './RainPreset'
import './RocketTrailPreset'
