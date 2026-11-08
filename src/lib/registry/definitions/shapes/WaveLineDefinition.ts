// ── BL-24: Wave LayerDefinition ───────────────────────────────────────────────
//
// Sinusoidal wave line. Open path (closed: false) — designed for stroke
// rendering. Animate `phase` to get a traveling-wave effect.
//
// y(t) = cy + amplitude * sin(2π * frequency * t + phase)

import { newWaveLayer } from '@/lib/defaults'
import { ShapeToPathConverter } from '@/lib/geometry'
import type { LayerDefinition } from '../../LayerDefinition'
import type { Layer } from '@/lib/types'
import type { PropertyGroup, PropertySchema } from '../../PropertySchema'
import {
  transformGroup, appearanceGroup, sizeGroup,
  fillGroup, strokeGroup, trimGroup, geometryGroup,
} from '../sharedSchemas'

const baseGroups = (extra: PropertyGroup[] = []): PropertyGroup[] => [
  transformGroup(),
  appearanceGroup(),
  sizeGroup(),
  fillGroup(),
  strokeGroup(),
  ...extra,
  trimGroup(),
]

const toPath = (layer: Layer) => {
  if (!layer.size) return { closed: false, commands: [] }
  return ShapeToPathConverter.convert('wave', layer.size, layer.shapeParams)
}

const waveGeometry = (): PropertySchema[] => [
  { id: 'amplitude', path: 'shapeParams.amplitude', group: 'Geometry', label: 'Amplitude', valueType: 'number',  animatable: true, defaultValue: 20,  min: 0 },
  { id: 'frequency', path: 'shapeParams.frequency', group: 'Geometry', label: 'Frequency', valueType: 'number',  animatable: true, defaultValue: 2,   min: 0.1, max: 50, step: 0.5 },
  { id: 'phase',     path: 'shapeParams.phase',     group: 'Geometry', label: 'Phase',     valueType: 'number',  animatable: true, defaultValue: 0,   min: -6.283, max: 6.283, step: 0.1 },
]

export const waveLineDefinition: LayerDefinition = {
  kind: 'wave',
  label: 'Wave',
  iconKey: 'wave',
  category: 'Basic Shapes',
  createDefault: () => newWaveLayer(),
  propertyGroupsAreStatic: true,
  getPropertyGroups: () => baseGroups([geometryGroup(waveGeometry())]),
  toPath,
}
