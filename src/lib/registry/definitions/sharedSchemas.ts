// ── Shared Property Schemas ───────────────────────────────────────────────────
//
// Every shape / text / media layer reuses the same Transform + Appearance
// groups. Centralising here means a label rename touches one file, not 17.
//
// Each builder returns ONE PropertyGroup that LayerDefinition can splice
// into its own getPropertyGroups() result.

import type { Layer } from '@/lib/types'
import type { PropertyGroup, PropertySchema } from '../PropertySchema'

// ── Transform (universal) ─────────────────────────────────────────────────────

export const transformGroup = (): PropertyGroup => ({
  title: 'Transform',
  schemas: [
    { id: 'tx',  path: 'transform.x',           group: 'Transform', label: 'X',          valueType: 'number', animatable: true,  defaultValue: 0 },
    { id: 'ty',  path: 'transform.y',           group: 'Transform', label: 'Y',          valueType: 'number', animatable: true,  defaultValue: 0 },
    { id: 'sx',  path: 'transform.scaleX',      group: 'Transform', label: 'Scale X',    valueType: 'number', animatable: true,  defaultValue: 1, step: 0.1 },
    { id: 'sy',  path: 'transform.scaleY',      group: 'Transform', label: 'Scale Y',    valueType: 'number', animatable: true,  defaultValue: 1, step: 0.1 },
    { id: 'rot', path: 'transform.rotationDeg', group: 'Transform', label: 'Rotation',   valueType: 'angle',  animatable: true,  defaultValue: 0 },
    { id: 'ax',  path: 'transform.anchorX',     group: 'Transform', label: 'Anchor X',   valueType: 'number', animatable: false, defaultValue: 0 },
    { id: 'ay',  path: 'transform.anchorY',     group: 'Transform', label: 'Anchor Y',   valueType: 'number', animatable: false, defaultValue: 0 },
  ],
})

// ── Appearance (universal: opacity + blend mode) ──────────────────────────────

export const appearanceGroup = (): PropertyGroup => ({
  title: 'Appearance',
  schemas: [
    { id: 'opacity',   path: 'opacity',   group: 'Appearance', label: 'Opacity',    valueType: 'percent', animatable: true,  defaultValue: 1, min: 0, max: 1, step: 0.01 },
    { id: 'blendMode', path: 'blendMode', group: 'Appearance', label: 'Blend Mode', valueType: 'select',  animatable: false, defaultValue: 'source-over',
      options: [
        { value: 'source-over', label: 'Normal'      },
        { value: 'multiply',    label: 'Multiply'    },
        { value: 'screen',      label: 'Screen'      },
        { value: 'overlay',     label: 'Overlay'     },
        { value: 'darken',      label: 'Darken'      },
        { value: 'lighten',     label: 'Lighten'     },
      ],
    },
  ],
})

// ── Size (shapes / images / videos) ───────────────────────────────────────────

export const sizeGroup = (): PropertyGroup => ({
  title: 'Size',
  schemas: [
    { id: 'w', path: 'size.width',  group: 'Size', label: 'Width',  valueType: 'number', animatable: false, defaultValue: 100, min: 1 },
    { id: 'h', path: 'size.height', group: 'Size', label: 'Height', valueType: 'number', animatable: false, defaultValue: 100, min: 1 },
  ],
  showWhen: (l) => l.size !== undefined,
})

// ── Fill (shapes) ─────────────────────────────────────────────────────────────

export const fillGroup = (): PropertyGroup => ({
  title: 'Fill',
  schemas: [
    { id: 'fillColor',   path: 'style.fill.color',   group: 'Fill', label: 'Color',   valueType: 'color',   animatable: true, defaultValue: '#3B82F6' },
    { id: 'fillOpacity', path: 'style.fill.opacity', group: 'Fill', label: 'Opacity', valueType: 'percent', animatable: true, defaultValue: 100, min: 0, max: 100, step: 1 },
  ],
  showWhen: (l) => l.type === 'shape' && !!l.style?.fill,
})

// ── Stroke (shapes) ───────────────────────────────────────────────────────────

export const strokeGroup = (): PropertyGroup => ({
  title: 'Stroke',
  schemas: [
    { id: 'strokeColor', path: 'style.stroke.color', group: 'Stroke', label: 'Color', valueType: 'color',  animatable: true, defaultValue: '#FFFFFF' },
    { id: 'strokeWidth', path: 'style.stroke.width', group: 'Stroke', label: 'Width', valueType: 'number', animatable: true, defaultValue: 0, min: 0, max: 100 },
    { id: 'strokeCap',   path: 'style.stroke.lineCap',  group: 'Stroke', label: 'Cap',  valueType: 'select', animatable: false, defaultValue: 'butt',
      options: [{ value: 'butt', label: 'Butt' }, { value: 'round', label: 'Round' }, { value: 'square', label: 'Square' }],
      showWhen: (l) => (l.style?.stroke?.width ?? 0) > 0,
    },
    { id: 'strokeJoin',  path: 'style.stroke.lineJoin', group: 'Stroke', label: 'Join', valueType: 'select', animatable: false, defaultValue: 'miter',
      options: [{ value: 'miter', label: 'Miter' }, { value: 'round', label: 'Round' }, { value: 'bevel', label: 'Bevel' }],
      showWhen: (l) => (l.style?.stroke?.width ?? 0) > 0,
    },
  ],
  showWhen: (l) => l.type === 'shape',
})

// ── Trim Path (shapes with stroke) ────────────────────────────────────────────

export const trimGroup = (): PropertyGroup => ({
  title: 'Trim Path',
  schemas: [
    { id: 'trimStart',  path: 'style.stroke.trim.start',  group: 'Trim Path', label: 'Start',  valueType: 'percent', animatable: true, defaultValue: 0, min: 0, max: 1, step: 0.01 },
    { id: 'trimEnd',    path: 'style.stroke.trim.end',    group: 'Trim Path', label: 'End',    valueType: 'percent', animatable: true, defaultValue: 1, min: 0, max: 1, step: 0.01 },
    { id: 'trimOffset', path: 'style.stroke.trim.offset', group: 'Trim Path', label: 'Offset', valueType: 'percent', animatable: true, defaultValue: 0, min: -1, max: 1, step: 0.01 },
  ],
  showWhen: (l) => l.type === 'shape' && (l.style?.stroke?.width ?? 0) > 0,
})

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a "Geometry" group from a custom schema list.
 * Each parametric shape passes its own params (sides, angles, endpoints).
 */
export const geometryGroup = (schemas: PropertySchema[]): PropertyGroup => ({
  title: 'Geometry',
  schemas,
})
