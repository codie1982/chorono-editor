// ── Sparkle Preset ────────────────────────────────────────────────────────────

import type { ParticleEmitterData } from '../types'
import { registerParticlePreset } from './ParticlePresetRegistry'

function createData(): ParticleEmitterData {
  return {
    mode: 'simple',
    emitter: {
      mode:         'burst',
      shape:        'circle',
      area:         { radius: 30 },
      burstCount:   40,
      maxParticles: 60,
      durationMs:   1200,
      loop:         false,
    },
    particle: {
      shape:         'star',
      size:          { min: 8, max: 18 },
      colorMode:     'palette',
      starPoints:    5,
      starInnerRatio: 0.4,
      palette: [
        { r: 255, g: 255, b: 180, a: 255 },  // cream yellow
        { r: 255, g: 230, b: 80,  a: 255 },  // gold
        { r: 255, g: 255, b: 255, a: 255 },  // white
      ],
    },
    animation: {
      lifetimeMs:       { min: 600, max: 1100 },
      positionOffset:   { x: { min: -40, max: 40 }, y: { min: -40, max: 40 }, easing: 'easeOut' },
      rotationVelocity: { min: -180, max: 180 },
      scaleOverLife: {
        stops: [
          { t: 0,   value: 0,   easing: 'easeOut' },
          { t: 0.2, value: 1 },
          { t: 1,   value: 0,   easing: 'easeIn' },
        ],
      },
      opacityOverLife: {
        stops: [
          { t: 0,   value: 0 },
          { t: 0.15, value: 1, easing: 'easeOut' },
          { t: 0.8, value: 1 },
          { t: 1,   value: 0, easing: 'easeIn' },
        ],
      },
    },
    random: {
      seed:               77,
      positionRandomness: 0.4,
      sizeRandomness:     0.4,
      rotationRandomness: 1,
      delayRandomness:    0.5,
      lifetimeRandomness: 0.3,
      colorRandomness:    0,
    },
    rendering: {
      blendMode: 'screen',
      softEdges: false,
      quality:   'medium',
    },
  }
}

registerParticlePreset({
  id:          'successSparkles',
  name:        'Success Sparkles',
  category:    'sparkle',
  description: 'Golden star burst for success, achievement, and reward moments.',
  tags:        ['sparkle', 'star', 'success', 'gold', 'achievement'],
  mobileSafe:  true,
  complexity:  'low',
  createData,
})

export const successSparklesPresetId = 'successSparkles'
