// ── PropertySchema ────────────────────────────────────────────────────────────
//
// Describes a single editable / animatable property on a layer. The
// PropertiesPanel renders inputs from these descriptors instead of hard-coding
// JSX per shape kind. New layer types only need to publish a schema —
// no PropertiesPanel changes required.

import type { Layer } from '@/lib/types'

export type PropValueType =
  | 'number'      // → NumInput
  | 'color'       // → ColorInput (hex string)
  | 'boolean'     // → checkbox
  | 'string'      // → text input
  | 'select'      // → <select> with options
  | 'angle'       // → number with ° unit
  | 'percent'     // → number with % unit (0–100 or 0–1 depending on min/max)
  | 'gradient'    // → GradientInput (edits a GradientFill object at the path)

export interface PropertySchema {
  /** Stable id — used as React key + path target for keyframes. */
  id: string
  /** Dot-separated Layer path, e.g. 'transform.x' or 'shapeParams.sides'. */
  path: string
  /** Section title in PropertiesPanel — 'Transform', 'Geometry', 'Stroke', … */
  group: string
  /** Human label shown next to the input. */
  label: string
  valueType: PropValueType
  /** Whether this property can be keyframed (controls + on PropertyRow). */
  animatable: boolean

  // ── Numeric constraints ──
  min?:  number
  max?:  number
  step?: number

  // ── Select options (when valueType === 'select') ──
  options?: { value: string; label: string }[]

  /** Default value used when constructing a default layer instance. */
  defaultValue: number | string | boolean

  /** Conditional visibility — schema is dropped from UI when this returns false. */
  showWhen?: (layer: Layer) => boolean

  /** Optional inline help text shown below the input. */
  help?: string

  /** Span both columns of the 2-col grid — useful for selects with long labels,
   *  preset pickers, or any field where the input needs breathing room. */
  fullWidth?: boolean
}

/** A logical grouping of schemas displayed together in a panel section. */
export interface PropertyGroup {
  title:    string
  schemas:  PropertySchema[]
  /** If set and returns false, the whole section is hidden. */
  showWhen?: (layer: Layer) => boolean
}
