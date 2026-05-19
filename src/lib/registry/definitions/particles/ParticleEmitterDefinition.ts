// ── ParticleEmitterDefinition ─────────────────────────────────────────────────
//
// LayerDefinition for 'particleEmitter' layers.
// Follows the exact same pattern as BL-24 SpiralDefinition / WaveLineDefinition.
//
// Sections (in render order):
//   Transform / Appearance — inherited via sharedSchemas
//   Preset                 — single-click swap to a registered preset
//   Emitter                — how particles are born (mode/shape/area/rate/loop)
//   Particle               — what particles look like (shape/size)
//   Animation              — how particles change over life (lifetime/offset)
//   Random                 — per-axis randomness factors
//   Rendering              — blend mode / soft edges / quality

import type { Layer } from '@/lib/types'
import type { LayerDefinition } from '../../LayerDefinition'
import type { PropertyGroup } from '../../PropertySchema'
import { newParticleEmitterLayer } from '@/lib/defaults'
import { transformGroup, appearanceGroup } from '../sharedSchemas'

// ── Helpers ───────────────────────────────────────────────────────────────────
const isContinuous = (l: Layer) => (l as any).particleEmitter?.emitter?.mode === 'continuous'
const isBurst      = (l: Layer) => (l as any).particleEmitter?.emitter?.mode !== 'continuous'
const isShape      = (s: string) => (l: Layer) => (l as any).particleEmitter?.emitter?.shape === s

export const particleEmitterDefinition: LayerDefinition = {
  kind:     'particleEmitter',
  label:    'Particle Emitter',
  iconKey:  'noise',
  category: 'Particles',

  createDefault(): Layer {
    return newParticleEmitterLayer()
  },

  getPropertyGroups(_layer: Layer): PropertyGroup[] {
    return [
      transformGroup(),
      appearanceGroup(),

      // ── Emitter ────────────────────────────────────────────────────────────
      {
        title: 'Emitter',
        schemas: [
          {
            id: 'pe.mode', path: 'particleEmitter.emitter.mode',
            group: 'Emitter', label: 'Spawn Mode',
            valueType: 'select', animatable: false, defaultValue: 'burst',
            fullWidth: true,
            options: [
              { value: 'burst',      label: 'Burst — all at once' },
              { value: 'continuous', label: 'Continuous — over time' },
            ],
          },
          {
            id: 'pe.shape', path: 'particleEmitter.emitter.shape',
            group: 'Emitter', label: 'Emit Shape',
            valueType: 'select', animatable: false, defaultValue: 'point',
            fullWidth: true,
            options: [
              { value: 'point',     label: 'Point (single source)' },
              { value: 'circle',    label: 'Circle (radial area)' },
              { value: 'rectangle', label: 'Rectangle (box area)' },
              { value: 'line',      label: 'Line (along a segment)' },
            ],
          },
          // Area: radius (circle only)
          {
            id: 'pe.area.radius', path: 'particleEmitter.emitter.area.radius',
            group: 'Emitter', label: 'Radius',
            valueType: 'number', animatable: true, defaultValue: 50, min: 0, max: 500,
            showWhen: isShape('circle'),
          },
          // Area: width / height (rectangle only)
          {
            id: 'pe.area.width', path: 'particleEmitter.emitter.area.width',
            group: 'Emitter', label: 'Width',
            valueType: 'number', animatable: true, defaultValue: 100, min: 0, max: 1000,
            showWhen: isShape('rectangle'),
          },
          {
            id: 'pe.area.height', path: 'particleEmitter.emitter.area.height',
            group: 'Emitter', label: 'Height',
            valueType: 'number', animatable: true, defaultValue: 100, min: 0, max: 1000,
            showWhen: isShape('rectangle'),
          },
          // Burst-mode only
          {
            id: 'pe.burstCount', path: 'particleEmitter.emitter.burstCount',
            group: 'Emitter', label: 'Burst Count',
            valueType: 'number', animatable: true, defaultValue: 60, min: 1, max: 500,
            showWhen: isBurst,
          },
          // Continuous-mode only
          {
            id: 'pe.rate', path: 'particleEmitter.emitter.ratePerSecond',
            group: 'Emitter', label: 'Rate / sec',
            valueType: 'number', animatable: true, defaultValue: 30, min: 1, max: 200,
            showWhen: isContinuous,
          },
          {
            id: 'pe.maxParticles', path: 'particleEmitter.emitter.maxParticles',
            group: 'Emitter', label: 'Max Particles',
            valueType: 'number', animatable: false, defaultValue: 120, min: 1, max: 500,
          },
          {
            id: 'pe.duration', path: 'particleEmitter.emitter.durationMs',
            group: 'Emitter', label: 'Duration (ms)',
            valueType: 'number', animatable: false, defaultValue: 2000, min: 100, step: 100,
          },
          {
            id: 'pe.startDelay', path: 'particleEmitter.emitter.startDelayMs',
            group: 'Emitter', label: 'Start Delay (ms)',
            valueType: 'number', animatable: false, defaultValue: 0, min: 0, step: 50,
          },
          {
            id: 'pe.loop', path: 'particleEmitter.emitter.loop',
            group: 'Emitter', label: 'Loop',
            valueType: 'boolean', animatable: false, defaultValue: false,
          },
          {
            id: 'pe.seed', path: 'particleEmitter.random.seed',
            group: 'Emitter', label: 'Seed',
            valueType: 'number', animatable: false, defaultValue: 42, min: 0, max: 99999,
          },
        ],
      },

      // ── Particle ───────────────────────────────────────────────────────────
      {
        title: 'Particle',
        schemas: [
          {
            id: 'pe.pshape', path: 'particleEmitter.particle.shape',
            group: 'Particle', label: 'Shape',
            valueType: 'select', animatable: false, defaultValue: 'rect',
            fullWidth: true,
            options: [
              { value: 'circle',      label: 'Circle' },
              { value: 'softCircle',  label: 'Soft Circle (radial fade)' },
              { value: 'rect',        label: 'Rectangle' },
              { value: 'roundedRect', label: 'Rounded Rectangle' },
              { value: 'star',        label: 'Star' },
              { value: 'triangle',    label: 'Triangle' },
              { value: 'line',        label: 'Line' },
              { value: 'smokePuff',   label: 'Smoke Puff' },
              { value: 'flameBlob',   label: 'Flame Blob' },
            ],
          },
          {
            id: 'pe.sizeMin', path: 'particleEmitter.particle.size.min',
            group: 'Particle', label: 'Size Min',
            valueType: 'number', animatable: true, defaultValue: 4, min: 0.5, max: 100,
          },
          {
            id: 'pe.sizeMax', path: 'particleEmitter.particle.size.max',
            group: 'Particle', label: 'Size Max',
            valueType: 'number', animatable: true, defaultValue: 12, min: 0.5, max: 100,
          },
        ],
      },

      // ── Animation ──────────────────────────────────────────────────────────
      {
        title: 'Animation',
        schemas: [
          {
            id: 'pe.ltMin', path: 'particleEmitter.animation.lifetimeMs.min',
            group: 'Animation', label: 'Lifetime Min (ms)',
            valueType: 'number', animatable: false, defaultValue: 800, min: 50, step: 50,
          },
          {
            id: 'pe.ltMax', path: 'particleEmitter.animation.lifetimeMs.max',
            group: 'Animation', label: 'Lifetime Max (ms)',
            valueType: 'number', animatable: false, defaultValue: 1600, min: 50, step: 50,
          },
          {
            id: 'pe.offX.min', path: 'particleEmitter.animation.positionOffset.x.min',
            group: 'Animation', label: 'Offset X Min',
            valueType: 'number', animatable: true, defaultValue: -50, min: -500, max: 500,
          },
          {
            id: 'pe.offX.max', path: 'particleEmitter.animation.positionOffset.x.max',
            group: 'Animation', label: 'Offset X Max',
            valueType: 'number', animatable: true, defaultValue: 50, min: -500, max: 500,
          },
          {
            id: 'pe.offY.min', path: 'particleEmitter.animation.positionOffset.y.min',
            group: 'Animation', label: 'Offset Y Min',
            valueType: 'number', animatable: true, defaultValue: -100, min: -500, max: 500,
          },
          {
            id: 'pe.offY.max', path: 'particleEmitter.animation.positionOffset.y.max',
            group: 'Animation', label: 'Offset Y Max',
            valueType: 'number', animatable: true, defaultValue: -20, min: -500, max: 500,
          },
          {
            id: 'pe.rotVel.min', path: 'particleEmitter.animation.rotationVelocity.min',
            group: 'Animation', label: 'Rot Vel Min (°/s)',
            valueType: 'number', animatable: true, defaultValue: -180, min: -1080, max: 1080,
          },
          {
            id: 'pe.rotVel.max', path: 'particleEmitter.animation.rotationVelocity.max',
            group: 'Animation', label: 'Rot Vel Max (°/s)',
            valueType: 'number', animatable: true, defaultValue: 180, min: -1080, max: 1080,
          },
        ],
      },

      // ── Randomness ─────────────────────────────────────────────────────────
      {
        title: 'Randomness',
        schemas: [
          {
            id: 'pe.rand.pos', path: 'particleEmitter.random.positionRandomness',
            group: 'Randomness', label: 'Position',
            valueType: 'percent', animatable: false, defaultValue: 0.5, min: 0, max: 1, step: 0.05,
          },
          {
            id: 'pe.rand.size', path: 'particleEmitter.random.sizeRandomness',
            group: 'Randomness', label: 'Size',
            valueType: 'percent', animatable: false, defaultValue: 0.4, min: 0, max: 1, step: 0.05,
          },
          {
            id: 'pe.rand.rot', path: 'particleEmitter.random.rotationRandomness',
            group: 'Randomness', label: 'Rotation',
            valueType: 'percent', animatable: false, defaultValue: 1, min: 0, max: 1, step: 0.05,
          },
          {
            id: 'pe.rand.delay', path: 'particleEmitter.random.delayRandomness',
            group: 'Randomness', label: 'Delay',
            valueType: 'percent', animatable: false, defaultValue: 0.3, min: 0, max: 1, step: 0.05,
          },
          {
            id: 'pe.rand.life', path: 'particleEmitter.random.lifetimeRandomness',
            group: 'Randomness', label: 'Lifetime',
            valueType: 'percent', animatable: false, defaultValue: 0.4, min: 0, max: 1, step: 0.05,
          },
          {
            id: 'pe.rand.color', path: 'particleEmitter.random.colorRandomness',
            group: 'Randomness', label: 'Color',
            valueType: 'percent', animatable: false, defaultValue: 0, min: 0, max: 1, step: 0.05,
          },
        ],
      },

      // ── Rendering ──────────────────────────────────────────────────────────
      {
        title: 'Rendering',
        schemas: [
          {
            id: 'pe.blend', path: 'particleEmitter.rendering.blendMode',
            group: 'Rendering', label: 'Blend Mode',
            valueType: 'select', animatable: false, defaultValue: 'normal',
            fullWidth: true,
            options: [
              { value: 'normal',   label: 'Normal (works on any bg)' },
              { value: 'screen',   label: 'Screen (needs dark bg)' },
              { value: 'additive', label: 'Additive (glow-like)' },
              { value: 'multiply', label: 'Multiply (darken)' },
            ],
          },
          {
            id: 'pe.soft', path: 'particleEmitter.rendering.softEdges',
            group: 'Rendering', label: 'Soft Edges',
            valueType: 'boolean', animatable: false, defaultValue: false,
          },
          {
            id: 'pe.quality', path: 'particleEmitter.rendering.quality',
            group: 'Rendering', label: 'Quality',
            valueType: 'select', animatable: false, defaultValue: 'medium',
            fullWidth: true,
            options: [
              { value: 'low',    label: 'Low (mobile)' },
              { value: 'medium', label: 'Medium (default)' },
              { value: 'high',   label: 'High (desktop)' },
            ],
          },
        ],
      },
    ]
  },
}
