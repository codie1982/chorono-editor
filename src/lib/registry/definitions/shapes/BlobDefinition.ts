// ── BL-24: Blob LayerDefinition ───────────────────────────────────────────────
//
// Seeded irregular closed polygon. Organic shape primitive — designed for fill.
// Deterministic: same (sides, irregularity, seed) → identical geometry.
//
// `seed` is NOT animatable — interpolating it would cause per-frame jumping.
// To animate the shape, animate `irregularity` instead.
//
// r(i) = baseR * (1 + irregularity * noise(seed, i))

import { newBlobLayer } from '@/lib/defaults'
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
  if (!layer.size) return { closed: true, commands: [] }
  return ShapeToPathConverter.convert('blob', layer.size, layer.shapeParams)
}

const blobGeometry = (): PropertySchema[] => [
  { id: 'sides',        path: 'shapeParams.sides',        group: 'Geometry', label: 'Points',       valueType: 'number',  animatable: false, defaultValue: 8,   min: 5, max: 64, step: 1 },
  { id: 'irregularity', path: 'shapeParams.irregularity', group: 'Geometry', label: 'Irregularity', valueType: 'percent', animatable: true,  defaultValue: 0.4, min: 0, max: 1, step: 0.05 },
  { id: 'seed',         path: 'shapeParams.seed',         group: 'Geometry', label: 'Seed',         valueType: 'number',  animatable: false, defaultValue: 42,  min: 0, step: 1 },
]

export const blobDefinition: LayerDefinition = {
  kind: 'blob',
  label: 'Blob',
  iconKey: 'blob',
  category: 'Basic Shapes',
  createDefault: () => newBlobLayer(),
  getPropertyGroups: () => baseGroups([geometryGroup(blobGeometry())]),
  toPath,
}
