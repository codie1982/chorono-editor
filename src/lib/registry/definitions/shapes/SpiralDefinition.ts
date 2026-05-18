// ── BL-24: Spiral LayerDefinition ─────────────────────────────────────────────
//
// Archimedean spiral primitive. Open path (closed: false) — designed for stroke
// rendering. Trim Path modifier produces "unwinding spiral" effect.
//
// Geometry: turns, startRadius, endRadius, tightness.
//   tightness = 1 → linear radius growth (uniform spacing)
//   tightness < 1 → looser outer turns
//   tightness > 1 → tighter inner turns

import { newSpiralLayer } from '@/lib/defaults'
import { ShapeToPathConverter } from '@/lib/geometry'
import type { LayerDefinition } from '../../LayerDefinition'
import type { Layer } from '@/lib/types'
import type { PropertyGroup, PropertySchema } from '../../PropertySchema'
import {
  transformGroup, appearanceGroup, sizeGroup,
  fillGroup, strokeGroup, trimGroup, geometryGroup,
} from '../sharedSchemas'

// baseGroups is defined locally in shapes/index.ts — inlined here to avoid
// cross-file coupling. If you change one, change both (or factor out later).
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
  return ShapeToPathConverter.convert('spiral', layer.size, layer.shapeParams)
}

const spiralGeometry = (): PropertySchema[] => [
  { id: 'turns',       path: 'shapeParams.turns',       group: 'Geometry', label: 'Turns',        valueType: 'number',  animatable: true,  defaultValue: 3,  min: 0.5, max: 20,  step: 0.5 },
  { id: 'startRadius', path: 'shapeParams.startRadius', group: 'Geometry', label: 'Inner Radius', valueType: 'number',  animatable: true,  defaultValue: 4,  min: 0 },
  { id: 'endRadius',   path: 'shapeParams.endRadius',   group: 'Geometry', label: 'Outer Radius', valueType: 'number',  animatable: true,  defaultValue: 56, min: 1 },
  { id: 'tightness',   path: 'shapeParams.tightness',   group: 'Geometry', label: 'Tightness',    valueType: 'number',  animatable: true,  defaultValue: 1,  min: 0.1, max: 5, step: 0.1 },
]

export const spiralDefinition: LayerDefinition = {
  kind: 'spiral',
  label: 'Spiral',
  iconKey: 'spiral',
  category: 'Basic Shapes',
  createDefault: () => newSpiralLayer(),
  getPropertyGroups: () => baseGroups([geometryGroup(spiralGeometry())]),
  toPath,
}
