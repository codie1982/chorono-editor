// ── Confetti Burst Preset ─────────────────────────────────────────────────────

import type { ParticleEmitterData } from '../types'
import { registerParticlePreset } from './ParticlePresetRegistry'

function createData(): ParticleEmitterData {
  return {
    mode: 'simple',
    emitter: {
      mode:         'burst',
      shape:        'point',
      burstCount:   80,
      maxParticles: 120,
      durationMs:   1800,
      loop:         false,
    },
    particle: {
      shape:     'rect',
      size:      { min: 6, max: 14 },
      colorMode: 'palette',
      palette: [
        { r: 255, g: 71,  b: 87,  a: 255 },  // red
        { r: 255, g: 165, b: 0,   a: 255 },  // orange
        { r: 255, g: 230, b: 0,   a: 255 },  // yellow
        { r: 0,   g: 200, b: 81,  a: 255 },  // green
        { r: 30,  g: 144, b: 255, a: 255 },  // blue
        { r: 157, g: 68,  b: 255, a: 255 },  // purple
        { r: 255, g: 105, b: 180, a: 255 },  // pink
      ],
    },
    animation: {
      lifetimeMs:       { min: 900, max: 1600 },
      positionOffset:   { x: { min: -60, max: 60 }, y: { min: 80, max: 200 }, easing: 'easeOut' },
      rotationVelocity: { min: -360, max: 360 },
      scaleOverLife: {
        stops: [
          { t: 0, value: 1 },
          { t: 1, value: 0.4, easing: 'easeIn' },
        ],
      },
      opacityOverLife: {
        stops: [
          { t: 0,   value: 1 },
          { t: 0.7, value: 1 },
          { t: 1,   value: 0, easing: 'easeIn' },
        ],
      },
    },
    random: {
      seed:               42,
      positionRandomness: 0.15,
      sizeRandomness:     0.35,
      rotationRandomness: 1,
      delayRandomness:    0.6,
      lifetimeRandomness: 0.3,
      colorRandomness:    0,
    },
    rendering: {
      blendMode: 'normal',
      softEdges: false,
      quality:   'medium',
    },
  }
}

registerParticlePreset({
  id:          'confettiBurst',
  name:        'Confetti Burst',
  category:    'confetti',
  description: 'Colorful confetti explosion — great for celebrations and success states.',
  tags:        ['confetti', 'burst', 'colorful', 'celebration', 'success'],
  mobileSafe:  true,
  complexity:  'low',
  createData,
})

export const confettiBurstPresetId = 'confettiBurst'
