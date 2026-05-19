// ── Smoke Puff Preset ─────────────────────────────────────────────────────────

import type { ParticleEmitterData } from '../types'
import { registerParticlePreset } from './ParticlePresetRegistry'

function createData(): ParticleEmitterData {
  return {
    mode: 'simple',
    emitter: {
      mode:          'continuous',
      shape:         'point',
      ratePerSecond: 8,
      maxParticles:  50,
      durationMs:    3000,
      loop:          true,
    },
    particle: {
      shape:     'softCircle',
      size:      { min: 20, max: 40 },
      colorMode: 'single',
      color:     { r: 180, g: 180, b: 180, a: 200 },
    },
    animation: {
      lifetimeMs:     { min: 1500, max: 2800 },
      positionOffset: { x: { min: -20, max: 20 }, y: { min: -120, max: -60 }, easing: 'easeOut' },
      scaleOverLife: {
        stops: [
          { t: 0,   value: 0.4 },
          { t: 0.3, value: 1,   easing: 'easeOut' },
          { t: 1,   value: 2.4, easing: 'linear' },
        ],
      },
      opacityOverLife: {
        stops: [
          { t: 0,   value: 0.35 },
          { t: 0.1, value: 0.35 },
          { t: 1,   value: 0,    easing: 'easeIn' },
        ],
      },
      motionModifiers: [
        { type: 'noiseDrift', enabled: true, amount: 18, speed: 0.4 },
      ],
    },
    random: {
      seed:               11,
      positionRandomness: 0.2,
      sizeRandomness:     0.5,
      rotationRandomness: 0.3,
      delayRandomness:    0.7,
      lifetimeRandomness: 0.35,
      colorRandomness:    0.1,
    },
    rendering: {
      blendMode: 'normal',
      softEdges: true,
      quality:   'medium',
    },
  }
}

registerParticlePreset({
  id:          'smokePuff',
  name:        'Smoke Puff',
  category:    'smoke',
  description: 'Rising soft smoke — for explosions, fire, or ambient atmosphere.',
  tags:        ['smoke', 'continuous', 'soft', 'atmospheric'],
  mobileSafe:  true,
  complexity:  'medium',
  createData,
})

export const smokePuffPresetId = 'smokePuff'
