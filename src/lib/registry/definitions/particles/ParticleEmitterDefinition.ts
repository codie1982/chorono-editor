// ── ParticleEmitterDefinition ─────────────────────────────────────────────────
//
// LayerDefinition for 'particleEmitter' layers.
// Follows the exact same pattern as BL-24 SpiralDefinition / WaveLineDefinition.

import type { Layer } from '@/lib/types'
import type { LayerDefinition } from '../../LayerDefinition'
import type { PropertyGroup } from '../../PropertySchema'
import { newParticleEmitterLayer } from '@/lib/defaults'
import { transformGroup, appearanceGroup } from '../sharedSchemas'

export const particleEmitterDefinition: LayerDefinition = {
  kind:     'particleEmitter',
  label:    'Particle Emitter',
  iconKey:  'noise',     // sprite: row 3, col 7 — existing icon
  category: 'Particles',

  createDefault(): Layer {
    return newParticleEmitterLayer()
  },

  getPropertyGroups(layer: Layer): PropertyGroup[] {
    const pe = (layer as any).particleEmitter
    const isContinuous = pe?.emitter?.mode === 'continuous'

    return [
      transformGroup(),
      appearanceGroup(),
      {
        title: 'Emitter',
        schemas: [
          {
            id: 'pe.mode', path: 'particleEmitter.emitter.mode',
            group: 'Emitter', label: 'Mode',
            valueType: 'select', animatable: false, defaultValue: 'burst',
            options: [
              { value: 'burst',      label: 'Burst' },
              { value: 'continuous', label: 'Continuous' },
            ],
          },
          {
            id: 'pe.burstCount', path: 'particleEmitter.emitter.burstCount',
            group: 'Emitter', label: 'Burst Count',
            valueType: 'number', animatable: true, defaultValue: 80, min: 1, max: 500,
            showWhen: (l: Layer) => (l as any).particleEmitter?.emitter?.mode !== 'continuous',
          },
          {
            id: 'pe.rate', path: 'particleEmitter.emitter.ratePerSecond',
            group: 'Emitter', label: 'Rate / sec',
            valueType: 'number', animatable: true, defaultValue: 30, min: 1, max: 200,
            showWhen: (l: Layer) => (l as any).particleEmitter?.emitter?.mode === 'continuous',
          },
          {
            id: 'pe.maxParticles', path: 'particleEmitter.emitter.maxParticles',
            group: 'Emitter', label: 'Max Particles',
            valueType: 'number', animatable: false, defaultValue: 120, min: 1, max: 500,
          },
          {
            id: 'pe.duration', path: 'particleEmitter.emitter.durationMs',
            group: 'Emitter', label: 'Duration ms',
            valueType: 'number', animatable: false, defaultValue: 1800, min: 100,
          },
          {
            id: 'pe.loop', path: 'particleEmitter.emitter.loop',
            group: 'Emitter', label: 'Loop',
            valueType: 'boolean', animatable: false, defaultValue: false,
          },
          {
            id: 'pe.seed', path: 'particleEmitter.random.seed',
            group: 'Emitter', label: 'Seed',
            valueType: 'number', animatable: false, defaultValue: 42, min: 0,
          },
        ],
      },
      {
        title: 'Particle',
        schemas: [
          {
            id: 'pe.pshape', path: 'particleEmitter.particle.shape',
            group: 'Particle', label: 'Shape',
            valueType: 'select', animatable: false, defaultValue: 'circle',
            options: [
              { value: 'circle',     label: 'Circle' },
              { value: 'softCircle', label: 'Soft Circle' },
              { value: 'rect',       label: 'Rectangle' },
              { value: 'roundedRect',label: 'Rounded Rect' },
              { value: 'star',       label: 'Star' },
              { value: 'triangle',   label: 'Triangle' },
              { value: 'line',       label: 'Line' },
              { value: 'smokePuff',  label: 'Smoke Puff' },
              { value: 'flameBlob',  label: 'Flame Blob' },
            ],
          },
          {
            id: 'pe.sizeMin', path: 'particleEmitter.particle.size.min',
            group: 'Particle', label: 'Size Min',
            valueType: 'number', animatable: true, defaultValue: 4, min: 0.5,
          },
          {
            id: 'pe.sizeMax', path: 'particleEmitter.particle.size.max',
            group: 'Particle', label: 'Size Max',
            valueType: 'number', animatable: true, defaultValue: 12, min: 0.5,
          },
        ],
      },
      {
        title: 'Animation',
        schemas: [
          {
            id: 'pe.ltMin', path: 'particleEmitter.animation.lifetimeMs.min',
            group: 'Animation', label: 'Lifetime Min ms',
            valueType: 'number', animatable: false, defaultValue: 800, min: 50,
          },
          {
            id: 'pe.ltMax', path: 'particleEmitter.animation.lifetimeMs.max',
            group: 'Animation', label: 'Lifetime Max ms',
            valueType: 'number', animatable: false, defaultValue: 1600, min: 50,
          },
        ],
      },
      {
        title: 'Random',
        schemas: [
          {
            id: 'pe.posRand', path: 'particleEmitter.random.positionRandomness',
            group: 'Random', label: 'Position',
            valueType: 'percent', animatable: false, defaultValue: 0.2, min: 0, max: 1, step: 0.05,
          },
          {
            id: 'pe.sizeRand', path: 'particleEmitter.random.sizeRandomness',
            group: 'Random', label: 'Size',
            valueType: 'percent', animatable: false, defaultValue: 0.35, min: 0, max: 1, step: 0.05,
          },
          {
            id: 'pe.rotRand', path: 'particleEmitter.random.rotationRandomness',
            group: 'Random', label: 'Rotation',
            valueType: 'percent', animatable: false, defaultValue: 1, min: 0, max: 1, step: 0.05,
          },
          {
            id: 'pe.delayRand', path: 'particleEmitter.random.delayRandomness',
            group: 'Random', label: 'Delay',
            valueType: 'percent', animatable: false, defaultValue: 0.7, min: 0, max: 1, step: 0.05,
          },
        ],
      },
    ]
  },
}
