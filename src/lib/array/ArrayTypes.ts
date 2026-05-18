// ── Array Types (BL-59) ───────────────────────────────────────────────────────
//
// Discriminated union of settings for the Array Tool. Each pattern has its
// OWN field set — TypeScript will reject Linear settings on a Radial config
// and vice versa, eliminating an entire class of "missing required field"
// bugs.
//
// Design (v2):
//   - sourcePolicy controls whether `count` includes the source. Default
//     'include-source' matches 3ds Max behaviour: count=5 produces 5 visible
//     objects (the source at index 0 + 4 new clones).
//   - ArrayTransformResolver returns ArrayInstanceTransform[]. Pure math —
//     no Layer allocation. Reusable by Preview, Repeater Modifier, and AI.

import type { Vec2 } from '../types'
import type { CloneMode } from '../clone/CloneTypes'

// ── Common enums ─────────────────────────────────────────────────────────────

/**
 * Whether `count` includes the source layer.
 *
 *   include-source     — Source occupies index 0. count=5 → 4 new clones.
 *                        (default — matches 3ds Max / AE behaviour)
 *   clone-source-too   — Source stays in place; count=5 → 5 new clones
 *                        all placed at step positions starting from 0.
 */
export type SourcePolicy = 'include-source' | 'clone-source-too'

/**
 * How move/rotate/scale values are interpreted.
 *
 *   incremental — step per copy. Each clone i is i*step from source.
 *                 (move=50, count=5 → x: 0, 50, 100, 150, 200)
 *   total       — total span across all copies. step = total / (count - 1).
 *                 (move=200, count=5 → step=50 → same positions as above)
 */
export type TransformMode = 'incremental' | 'total'

/**
 * In which space transform deltas are applied.
 *
 *   world  — Step vector is in world space (untouched by parent rotation).
 *   local  — Step vector is in source's LOCAL space (rotates with source).
 *   parent — Step vector is in source's PARENT space (rotates with parent).
 *
 * MVP implements 'world' fully. 'local' and 'parent' fall back to 'world'
 * with a `console.warn` until matrix composition is wired through.
 */
export type CoordinateSpace = 'world' | 'local' | 'parent'

// ── Stagger (Grid only) ──────────────────────────────────────────────────────

export interface GridStagger {
  enabled: boolean
  /** Which rows are offset. */
  mode: 'odd-rows' | 'even-rows'
  /** How much to offset, in source's local pixels. */
  offset: Vec2
}

// ── Base settings (common to every pattern) ──────────────────────────────────

export interface BaseArraySettings {
  cloneMode: CloneMode               // default: 'copy'
  transformMode: TransformMode       // default: 'incremental'
  space: CoordinateSpace             // default: 'world'
  sourcePolicy: SourcePolicy         // default: 'include-source'
  /** When true, animation tracks targeting the source are duplicated to
   *  every new clone (with fresh keyframe ids). Default true. */
  duplicateAnimation: boolean
  /** Optional ms offset applied to each clone's duplicated keyframes
   *  (useful for stagger effects: time-offset by index * timeOffsetMs). */
  timeOffsetMs?: number
}

// ── Linear ───────────────────────────────────────────────────────────────────

export interface LinearArraySettings extends BaseArraySettings {
  pattern: 'linear'
  /** Total objects (including source if sourcePolicy='include-source'). */
  count: number
  /** Translation step or total span, per transformMode. */
  move: Vec2
  /** Rotation step in degrees, per transformMode. */
  rotationDeg: number
  /**
   * Scale step (multiplicative) or total span, per transformMode.
   * Incremental: clone[i].scale = source.scale * scale^i
   * Total:       step = (scaleEnd / scaleStart) ^ (1 / (count-1))
   */
  scale: Vec2
}

// ── Grid ─────────────────────────────────────────────────────────────────────

export interface GridArraySettings extends BaseArraySettings {
  pattern: 'grid'
  columns: number
  rows: number
  /** Step between columns (within a row). */
  columnMove: Vec2
  /** Step between rows. */
  rowMove: Vec2
  stagger?: GridStagger
}

// ── Radial ───────────────────────────────────────────────────────────────────

export interface RadialArraySettings extends BaseArraySettings {
  pattern: 'radial'
  count: number
  /** Center of rotation in source's local space (or world if space='world'). */
  center: Vec2
  radius: number
  /** Starting angle (degrees, 0 = 12 o'clock convention to match RepeaterResolver). */
  startAngleDeg: number
  /** Total arc span in degrees. */
  totalAngleDeg: number
  /**
   * If true, angleStep = total / count (instances evenly distributed
   * around the full circle without overlap at start/end).
   * If false, angleStep = total / (count - 1) (instances span from
   * startAngle to startAngle + total inclusive).
   */
  closed: boolean
  /** When true, each instance rotates to face outward (radial tangent). */
  orientToAngle: boolean
  /** Rotation offset applied on top of orient (degrees). */
  rotationOffsetDeg: number
}

// ── Union ────────────────────────────────────────────────────────────────────

export type ArraySettings =
  | LinearArraySettings
  | GridArraySettings
  | RadialArraySettings

export type ArrayPattern = ArraySettings['pattern']

// ── Per-instance result ──────────────────────────────────────────────────────

/**
 * What the resolver produces — one record per array instance.
 *
 * The factory uses `position` / `rotation` / `scale` to build a fresh
 * Layer with the cloned transform. `matrix` is included for renderer /
 * preview consumers that prefer raw affine matrices.
 */
export interface ArrayInstanceTransform {
  /** 0..count-1 (or 0..rows*cols-1 for grid). */
  index: number
  /** Absolute world position (or local — depends on `settings.space`). */
  position: Vec2
  /** Absolute rotation in degrees. */
  rotation: number
  /** Absolute scale. */
  scale: Vec2
  /** Multiplicative opacity (1 = unchanged). */
  opacity: number
  /**
   * True when this entry IS the source layer itself (index 0 when
   * sourcePolicy='include-source'). The factory skips these — only
   * isSourceIndex=false entries become new layers.
   */
  isSourceIndex: boolean
}

// ── Defaults factory (used by Modal initial state) ───────────────────────────

export function defaultLinearArraySettings(): LinearArraySettings {
  return {
    pattern: 'linear',
    count: 5,
    move: { x: 100, y: 0 },
    rotationDeg: 0,
    scale: { x: 1, y: 1 },
    cloneMode: 'copy',
    transformMode: 'incremental',
    space: 'world',
    sourcePolicy: 'include-source',
    duplicateAnimation: true,
  }
}

export function defaultGridArraySettings(): GridArraySettings {
  return {
    pattern: 'grid',
    columns: 3,
    rows: 3,
    columnMove: { x: 100, y: 0 },
    rowMove: { x: 0, y: 100 },
    cloneMode: 'copy',
    transformMode: 'incremental',
    space: 'world',
    sourcePolicy: 'include-source',
    duplicateAnimation: true,
  }
}

export function defaultRadialArraySettings(): RadialArraySettings {
  return {
    pattern: 'radial',
    count: 8,
    center: { x: 0, y: 0 },
    radius: 150,
    startAngleDeg: 0,
    totalAngleDeg: 360,
    closed: true,
    orientToAngle: false,
    rotationOffsetDeg: 0,
    cloneMode: 'copy',
    transformMode: 'incremental',
    space: 'world',
    sourcePolicy: 'include-source',
    duplicateAnimation: true,
  }
}

// ── Result returned by Clone/Array commands ──────────────────────────────────

/**
 * Result metadata exposed by clone/array commands. The standard
 * EditorCommand interface (execute/undo) returns the new scene only;
 * this side-channel lets the caller learn which layers were created
 * so it can select them, scroll into view, etc.
 */
export interface EditorCommandResult {
  label: string
  createdLayerIds: string[]
  createdTrackTargets: string[]
  suggestedSelection: string[]
}
