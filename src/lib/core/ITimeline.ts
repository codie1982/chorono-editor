// ── ITimeline ─────────────────────────────────────────────────────────────────
// Abstract timeline contract. In 2D animation mode this maps to the existing
// Track[] + Keyframe[] structure. Other modes (video clips, game events…) will
// provide their own implementations.

import type { EditorMode } from './EditorMode'
import type { AnimatableValue } from '../types'

/** Dot-path reference to an animatable property, e.g. "layers.card.opacity". */
export interface PropertyPath {
  /** Unique id of the target object. */
  objectId: string
  /** Dot-path within that object, e.g. "transform.x" | "opacity". */
  property: string
}

/** A resolved property value at a specific point in time. */
export interface PropertyValue {
  /** Dot-path that was evaluated, e.g. "layers.card.opacity". */
  path: string
  value: AnimatableValue
}

export interface ITimeline {
  id: string
  durationMs: number
  /** Mode that owns this timeline — gates type-narrowing in renderer/evaluator. */
  mode: EditorMode

  /**
   * Evaluate all animated properties at the given time.
   * Returns the resolved value for every tracked property.
   */
  evaluate(timeMs: number): PropertyValue[]

  /**
   * Insert or update a keyframe for `target` at `timeMs`.
   * Concrete implementations decide what "keyframe" means in their context.
   */
  addKey(target: PropertyPath, timeMs: number, value: unknown): void
}
