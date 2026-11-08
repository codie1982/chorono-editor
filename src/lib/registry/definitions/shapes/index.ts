// ── Built-in Shape LayerDefinitions ───────────────────────────────────────────
//
// One definition per ShapeKind. Each delegates to the existing factory in
// defaults.ts for createDefault() — once Sprint 5.0.10 deletes the
// factories, those calls will be inlined here.
//
// getPropertyGroups() always returns the same universal sections
// (Transform → Size → Fill → Stroke → Trim Path → optional Geometry).
// PropertiesPanel will read this list and render generically.

import type { Layer } from '@/lib/types'
import type { LayerDefinition } from '../../LayerDefinition'
import type { PropertyGroup, PropertySchema } from '../../PropertySchema'
import {
  newRectLayer, newRoundedRectLayer, newCircleLayer,
  newEllipseLayer, newLineLayer, newArrowLayer,
  newPolygonLayer, newStarLayer, newRingLayer, newArcLayer, newCapsuleLayer,
} from '@/lib/defaults'
import {
  transformGroup, appearanceGroup, sizeGroup,
  fillGroup, strokeGroup, trimGroup, geometryGroup,
} from '../sharedSchemas'
import { ShapeToPathConverter } from '@/lib/geometry'

// ── Shared base groups (computed once) ────────────────────────────────────────

const baseGroups = (extra: PropertyGroup[] = []): PropertyGroup[] => [
  transformGroup(),
  appearanceGroup(),
  sizeGroup(),
  fillGroup(),
  strokeGroup(),
  ...extra,
  trimGroup(),
]

// ── Shape-specific geometry schemas ───────────────────────────────────────────

const polygonGeometry = (): PropertySchema[] => [
  { id: 'sides',     path: 'shapeParams.sides',     group: 'Geometry', label: 'Sides',         valueType: 'number',  animatable: true, defaultValue: 6, min: 3, max: 12, step: 1 },
  { id: 'roundness', path: 'shapeParams.roundness', group: 'Geometry', label: 'Roundness',     valueType: 'percent', animatable: true, defaultValue: 0, min: 0, max: 1, step: 0.05 },
]

const starGeometry = (): PropertySchema[] => [
  { id: 'points',     path: 'shapeParams.sides',       group: 'Geometry', label: 'Points',       valueType: 'number',  animatable: true, defaultValue: 5,  min: 3, max: 12, step: 1 },
  { id: 'outerR',     path: 'shapeParams.outerRadius', group: 'Geometry', label: 'Outer Radius', valueType: 'number',  animatable: true, defaultValue: 60, min: 1 },
  { id: 'innerR',     path: 'shapeParams.innerRadius', group: 'Geometry', label: 'Inner Radius', valueType: 'number',  animatable: true, defaultValue: 27, min: 1 },
  { id: 'roundness',  path: 'shapeParams.roundness',   group: 'Geometry', label: 'Roundness',    valueType: 'percent', animatable: true, defaultValue: 0,  min: 0, max: 1, step: 0.05 },
]

const ringGeometry = (): PropertySchema[] => [
  { id: 'startAngle', path: 'shapeParams.startAngle',  group: 'Geometry', label: 'Start °',      valueType: 'angle',  animatable: true, defaultValue: 0,   min: -360, max: 360 },
  { id: 'endAngle',   path: 'shapeParams.endAngle',    group: 'Geometry', label: 'End °',        valueType: 'angle',  animatable: true, defaultValue: 360, min: -360, max: 360 },
  { id: 'innerR',     path: 'shapeParams.innerRadius', group: 'Geometry', label: 'Inner Radius', valueType: 'number', animatable: true, defaultValue: 30,  min: 1 },
]

const arcGeometry = (): PropertySchema[] => [
  { id: 'startAngle', path: 'shapeParams.startAngle', group: 'Geometry', label: 'Start °', valueType: 'angle', animatable: true, defaultValue: -90, min: -360, max: 360 },
  { id: 'endAngle',   path: 'shapeParams.endAngle',   group: 'Geometry', label: 'End °',   valueType: 'angle', animatable: true, defaultValue:  90, min: -360, max: 360 },
]

const lineGeometry = (): PropertySchema[] => [
  { id: 'x2', path: 'shapeParams.x2', group: 'Geometry', label: 'End X', valueType: 'number', animatable: true, defaultValue: 160 },
  { id: 'y2', path: 'shapeParams.y2', group: 'Geometry', label: 'End Y', valueType: 'number', animatable: true, defaultValue: 0 },
]

const arrowGeometry = (): PropertySchema[] => [
  ...lineGeometry(),
  { id: 'arrowHead', path: 'shapeParams.arrowHeadSize', group: 'Geometry', label: 'Head Size', valueType: 'number', animatable: true, defaultValue: 14, min: 2, max: 60 },
]

const rectGeometry = (): PropertySchema[] => [
  { id: 'cornerRadius', path: 'style.cornerRadius', group: 'Geometry', label: 'Corner Radius', valueType: 'number', animatable: true, defaultValue: 0, min: 0 },
]

// ── Helper: turn ShapeKind size+params into a PathDefinition ────────────────

const toPathHelper = (layer: Layer) => {
  if (!layer.size) return { closed: false, commands: [] }
  const kind = (layer as any).shapeKind ?? layer.shape ?? 'rect'
  return ShapeToPathConverter.convert(
    kind,
    layer.size,
    layer.shapeParams,
    layer.style?.cornerRadius ?? 0,
  )
}

// ── Definitions ───────────────────────────────────────────────────────────────

export const rectDefinition: LayerDefinition = {
  kind: 'rect',
  label: 'Rectangle',
  iconKey: 'rectangle',
  category: 'Basic Shapes',
  createDefault: () => newRectLayer(),
  propertyGroupsAreStatic: true,
  getPropertyGroups: () => baseGroups([geometryGroup(rectGeometry())]),
  toPath: toPathHelper,
}

export const roundedRectDefinition: LayerDefinition = {
  kind: 'roundedRect',
  label: 'Rounded Rect',
  iconKey: 'roundedRectangle',
  category: 'Basic Shapes',
  createDefault: () => newRoundedRectLayer(),
  propertyGroupsAreStatic: true,
  getPropertyGroups: () => baseGroups([geometryGroup(rectGeometry())]),
  toPath: toPathHelper,
}

export const circleDefinition: LayerDefinition = {
  kind: 'circle',
  label: 'Circle',
  iconKey: 'circle',
  category: 'Basic Shapes',
  createDefault: () => newCircleLayer(),
  propertyGroupsAreStatic: true,
  getPropertyGroups: () => baseGroups(),
  toPath: toPathHelper,
}

export const ellipseDefinition: LayerDefinition = {
  kind: 'ellipse',
  label: 'Ellipse',
  iconKey: 'ellipse',
  category: 'Basic Shapes',
  createDefault: () => newEllipseLayer(),
  propertyGroupsAreStatic: true,
  getPropertyGroups: () => baseGroups(),
  toPath: toPathHelper,
}

export const lineDefinition: LayerDefinition = {
  kind: 'line',
  label: 'Line',
  iconKey: 'line',
  category: 'Basic Shapes',
  createDefault: () => newLineLayer(),
  propertyGroupsAreStatic: true,
  getPropertyGroups: () => baseGroups([geometryGroup(lineGeometry())]),
  toPath: toPathHelper,
}

export const arrowDefinition: LayerDefinition = {
  kind: 'arrow',
  label: 'Arrow',
  iconKey: 'arrow',
  category: 'Basic Shapes',
  createDefault: () => newArrowLayer(),
  propertyGroupsAreStatic: true,
  getPropertyGroups: () => baseGroups([geometryGroup(arrowGeometry())]),
  toPath: toPathHelper,
}

export const polygonDefinition: LayerDefinition = {
  kind: 'polygon',
  label: 'Polygon',
  iconKey: 'polygon',
  category: 'Basic Shapes',
  createDefault: () => newPolygonLayer(),
  propertyGroupsAreStatic: true,
  getPropertyGroups: () => baseGroups([geometryGroup(polygonGeometry())]),
  toPath: toPathHelper,
}

export const starDefinition: LayerDefinition = {
  kind: 'star',
  label: 'Star',
  iconKey: 'star',
  category: 'Basic Shapes',
  createDefault: () => newStarLayer(),
  propertyGroupsAreStatic: true,
  getPropertyGroups: () => baseGroups([geometryGroup(starGeometry())]),
  toPath: toPathHelper,
}

export const ringDefinition: LayerDefinition = {
  kind: 'ring',
  label: 'Ring',
  iconKey: 'ring',
  category: 'Basic Shapes',
  createDefault: () => newRingLayer(),
  propertyGroupsAreStatic: true,
  getPropertyGroups: () => baseGroups([geometryGroup(ringGeometry())]),
  toPath: toPathHelper,
}

export const arcDefinition: LayerDefinition = {
  kind: 'arc',
  label: 'Arc',
  iconKey: 'arc',
  category: 'Basic Shapes',
  createDefault: () => newArcLayer(),
  propertyGroupsAreStatic: true,
  getPropertyGroups: () => baseGroups([geometryGroup(arcGeometry())]),
  toPath: toPathHelper,
}

export const capsuleDefinition: LayerDefinition = {
  kind: 'capsule',
  label: 'Capsule',
  iconKey: 'capsule',
  category: 'Basic Shapes',
  createDefault: () => newCapsuleLayer(),
  propertyGroupsAreStatic: true,
  getPropertyGroups: () => baseGroups(),
  toPath: toPathHelper,
}

// ── BL-24: Organic primitives ────────────────────────────────────────────────
import { spiralDefinition }   from './SpiralDefinition'
import { waveLineDefinition } from './WaveLineDefinition'
import { blobDefinition }     from './BlobDefinition'

export { spiralDefinition, waveLineDefinition, blobDefinition }

export const ALL_SHAPE_DEFINITIONS: LayerDefinition[] = [
  rectDefinition,
  roundedRectDefinition,
  circleDefinition,
  ellipseDefinition,
  lineDefinition,
  arrowDefinition,
  polygonDefinition,
  starDefinition,
  ringDefinition,
  arcDefinition,
  capsuleDefinition,
  // BL-24
  spiralDefinition,
  waveLineDefinition,
  blobDefinition,
]
