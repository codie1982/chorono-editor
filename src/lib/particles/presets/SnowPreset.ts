// ── Snow Fall Preset ──────────────────────────────────────────────────────────

import type { ParticleEmitterData } from '../types'
import { registerParticlePreset } from './ParticlePresetRegistry'

function createData(): ParticleEmitterData {
  return {
    mode: 'simple',
    emitter: {
      mode:          'continuous',
      shape:         'rectangle',
      area:          { width: 360, height: 10 },
      ratePerSecond: 12,
      maxParticles:  100,
      durationMs:    5000,
      loop:          true,
      startDelayMs:  0,
    },
    particle: {
      shape:     'softCircle',
      size:      { min: 3, max: 9 },
      colorMode: 'single',
      color:     { r: 220, g: 235, b: 255, a: 230 },
    },
    animation: {
      lifetimeMs:     { min: 3000, max: 5000 },
      positionOffset: { x: { min: -30, max: 30 }, y: { min: 200, max: 400 }, easing: 'linear' },
      rotationVelocity: { min: -20, max: 20 },
      opacityOverLife: {
        stops: [
          { t: 0,    value: 0 },
          { t: 0.05, value: 0.85, easing: 'easeOut' },
          { t: 0.9,  value: 0.85 },
          { t: 1,    value: 0,    easing: 'easeIn' },
        ],
      },
      motionModifiers: [
        { type: 'noiseDrift', enabled: true, amount: 15, speed: 0.3 },
      ],
    },
    random: {
      seed:               55,
      positionRandomness: 1.0,
      sizeRandomness:     0.6,
      rotationRandomness: 0.2,
      delayRandomness:    1.0,
      lifetimeRandomness: 0.4,
      colorRandomness:    0.05,
    },
    rendering: {
      blendMode: 'normal',
      softEdges: true,
      quality:   'medium',
    },
  }
}

registerParticlePreset({
  id:          'snowFall',
  name:        'Snow Fall',
  category:    'weather',
  description: 'Gentle snowfall — looping, wide coverage.',
  tags:        ['snow', 'weather', 'loop', 'winter', 'ambient'],
  mobileSafe:  true,
  complexity:  'low',
  createData,
})

export const snowFallPresetId = 'snowFall'
