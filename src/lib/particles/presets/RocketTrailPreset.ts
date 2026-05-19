// ── Rocket Trail Preset ───────────────────────────────────────────────────────

import type { ParticleEmitterData } from '../types'
import { registerParticlePreset } from './ParticlePresetRegistry'

function createData(): ParticleEmitterData {
  return {
    mode: 'simple',
    emitter: {
      mode:          'continuous',
      shape:         'point',
      ratePerSecond: 40,
      maxParticles:  100,
      durationMs:    2000,
      loop:          true,
    },
    particle: {
      shape:     'softCircle',
      size:      { min: 4, max: 12 },
      colorMode: 'gradientOverLife',
      colorOverLife: {
        stops: [
          { t: 0,   value: { r: 255, g: 255, b: 200, a: 255 } },  // white-yellow
          { t: 0.3, value: { r: 255, g: 160, b: 50,  a: 200 } },  // orange
          { t: 0.7, value: { r: 100, g: 60,  b: 60,  a: 120 } },  // brown smoke
          { t: 1,   value: { r: 60,  g: 60,  b: 60,  a: 0   } },  // grey → transparent
        ],
      },
    },
    animation: {
      lifetimeMs:     { min: 300, max: 600 },
      positionOffset: { x: { min: -10, max: 10 }, y: { min: 20, max: 60 }, easing: 'easeOut' },
      scaleOverLife: {
        stops: [
          { t: 0,   value: 1 },
          { t: 1,   value: 1.8, easing: 'linear' },
        ],
      },
      opacityOverLife: {
        stops: [
          { t: 0,   value: 1 },
          { t: 0.4, value: 0.6 },
          { t: 1,   value: 0,   easing: 'easeIn' },
        ],
      },
    },
    random: {
      seed:               99,
      positionRandomness: 0.1,
      sizeRandomness:     0.4,
      rotationRandomness: 0,
      delayRandomness:    0.5,
      lifetimeRandomness: 0.35,
      colorRandomness:    0,
    },
    rendering: {
      blendMode: 'screen',
      softEdges: true,
      quality:   'medium',
    },
  }
}

registerParticlePreset({
  id:          'rocketTrail',
  name:        'Rocket Trail',
  category:    'trail',
  description: 'Glowing exhaust trail for projectiles and rockets.',
  tags:        ['trail', 'rocket', 'exhaust', 'fire', 'projectile'],
  mobileSafe:  true,
  complexity:  'medium',
  createData,
})

export const rocketTrailPresetId = 'rocketTrail'
