// ── Rain Lines Preset ─────────────────────────────────────────────────────────

import type { ParticleEmitterData } from '../types'
import { registerParticlePreset } from './ParticlePresetRegistry'

function createData(): ParticleEmitterData {
  return {
    mode: 'simple',
    emitter: {
      mode:          'continuous',
      shape:         'rectangle',
      area:          { width: 400, height: 10 },
      ratePerSecond: 30,
      maxParticles:  120,
      durationMs:    3000,
      loop:          true,
    },
    particle: {
      shape:     'line',
      size:      { min: 10, max: 20 },  // length
      colorMode: 'single',
      color:     { r: 160, g: 200, b: 230, a: 180 },
    },
    animation: {
      lifetimeMs:     { min: 400, max: 700 },
      positionOffset: { x: { min: -15, max: 15 }, y: { min: 200, max: 350 }, easing: 'linear' },
      opacityOverLife: {
        stops: [
          { t: 0,   value: 0 },
          { t: 0.1, value: 0.7, easing: 'easeOut' },
          { t: 0.9, value: 0.7 },
          { t: 1,   value: 0,   easing: 'easeIn' },
        ],
      },
    },
    random: {
      seed:               88,
      positionRandomness: 1.0,
      sizeRandomness:     0.5,
      rotationRandomness: 0.05,
      delayRandomness:    1.0,
      lifetimeRandomness: 0.3,
      colorRandomness:    0.1,
    },
    rendering: {
      blendMode: 'normal',
      softEdges: false,
      quality:   'low',
    },
  }
}

registerParticlePreset({
  id:          'rainLines',
  name:        'Rain Lines',
  category:    'weather',
  description: 'Fast-falling rain streaks — looping, wide area.',
  tags:        ['rain', 'weather', 'loop', 'fast', 'lines'],
  mobileSafe:  true,
  complexity:  'low',
  createData,
})

export const rainLinesPresetId = 'rainLines'
