// ── Fire Flame Preset ─────────────────────────────────────────────────────────

import type { ParticleEmitterData } from '../types'
import { registerParticlePreset } from './ParticlePresetRegistry'

function createData(): ParticleEmitterData {
  return {
    mode: 'simple',
    emitter: {
      mode:          'continuous',
      shape:         'line',
      area:          { lineStart: { x: -20, y: 0 }, lineEnd: { x: 20, y: 0 } },
      ratePerSecond: 20,
      maxParticles:  80,
      durationMs:    2000,
      loop:          true,
    },
    particle: {
      shape:     'flameBlob',
      size:      { min: 14, max: 28 },
      colorMode: 'gradientOverLife',
      colorOverLife: {
        stops: [
          { t: 0,    value: { r: 255, g: 220, b: 60,  a: 255 } },  // bright yellow
          { t: 0.3,  value: { r: 255, g: 130, b: 20,  a: 255 } },  // orange
          { t: 0.7,  value: { r: 200, g: 40,  b: 10,  a: 220 } },  // deep red
          { t: 1,    value: { r: 80,  g: 20,  b: 0,   a: 0   } },  // dark → transparent
        ],
      },
    },
    animation: {
      lifetimeMs:     { min: 400, max: 800 },
      positionOffset: { x: { min: -10, max: 10 }, y: { min: -80, max: -40 }, easing: 'easeOut' },
      scaleOverLife: {
        stops: [
          { t: 0,   value: 0.6 },
          { t: 0.2, value: 1,   easing: 'easeOut' },
          { t: 1,   value: 0.2, easing: 'easeIn' },
        ],
      },
      opacityOverLife: {
        stops: [
          { t: 0,   value: 1 },
          { t: 0.6, value: 0.8 },
          { t: 1,   value: 0,   easing: 'easeIn' },
        ],
      },
      motionModifiers: [
        { type: 'noiseDrift', enabled: true, amount: 8, speed: 1.5 },
      ],
    },
    random: {
      seed:               33,
      positionRandomness: 0.2,
      sizeRandomness:     0.4,
      rotationRandomness: 0.2,
      delayRandomness:    0.8,
      lifetimeRandomness: 0.4,
      colorRandomness:    0,
    },
    rendering: {
      blendMode: 'screen',
      softEdges: true,
      glow: { enabled: true, radius: 12, intensity: 0.7 },
      quality:   'medium',
    },
  }
}

registerParticlePreset({
  id:          'fireFame',
  name:        'Fire Flame',
  category:    'fire',
  description: 'Realistic-looking flame with color gradient over lifetime.',
  tags:        ['fire', 'flame', 'continuous', 'hot', 'glow'],
  mobileSafe:  false,  // glow is expensive
  complexity:  'high',
  createData,
})

export const fireFamePresetId = 'fireFame'
