// ── Magic Dust Preset ─────────────────────────────────────────────────────────
// This is the DEFAULT preset used by newParticleEmitterLayer().

import type { ParticleEmitterData } from '../types'
import { registerParticlePreset } from './ParticlePresetRegistry'

function createData(): ParticleEmitterData {
  return {
    mode: 'simple',
    emitter: {
      mode:         'continuous',
      shape:        'circle',
      area:         { radius: 20 },
      ratePerSecond: 25,
      maxParticles: 80,
      durationMs:   2000,
      loop:         true,
    },
    particle: {
      shape:     'circle',
      size:      { min: 3, max: 8 },
      colorMode: 'gradientOverLife',
      colorOverLife: {
        stops: [
          { t: 0,   value: { r: 180, g: 100, b: 255, a: 255 } },  // purple
          { t: 0.5, value: { r: 80,  g: 180, b: 255, a: 255 } },  // cyan
          { t: 1,   value: { r: 255, g: 200, b: 80,  a: 0   } },  // gold → transparent
        ],
      },
    },
    animation: {
      lifetimeMs:     { min: 800, max: 1600 },
      positionOffset: { x: { min: -15, max: 15 }, y: { min: -60, max: -20 }, easing: 'easeOut' },
      scaleOverLife: {
        stops: [
          { t: 0,   value: 0.3 },
          { t: 0.3, value: 1, easing: 'easeOut' },
          { t: 1,   value: 0, easing: 'easeIn' },
        ],
      },
      opacityOverLife: {
        stops: [
          { t: 0,   value: 0 },
          { t: 0.2, value: 0.9, easing: 'easeOut' },
          { t: 0.7, value: 0.7 },
          { t: 1,   value: 0,   easing: 'easeIn' },
        ],
      },
      motionModifiers: [
        { type: 'noiseDrift', enabled: true, amount: 12, speed: 0.8 },
      ],
    },
    random: {
      seed:               42,
      positionRandomness: 0.5,
      sizeRandomness:     0.4,
      rotationRandomness: 0,
      delayRandomness:    0.8,
      lifetimeRandomness: 0.4,
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
  id:          'magicDust',
  name:        'Magic Dust',
  category:    'magic',
  description: 'Continuous rising sparkle dust — perfect as a layer accent.',
  tags:        ['magic', 'dust', 'continuous', 'glow', 'ambient'],
  mobileSafe:  true,
  complexity:  'medium',
  createData,
})

export const magicDustPresetId = 'magicDust'
