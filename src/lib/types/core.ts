// ── Core Scene Types ──────────────────────────────────────────────────────────
// The data model shared between builder, evaluator, renderer, and runtime JSON.

import type { ShapeStyle }  from './style'
import type { TextStyle }   from './text'
import type { ImageData, VideoData, AudioData, Asset } from './media'
import type { LayerEffects, MotionPath } from './effects'

// ── Primitives ────────────────────────────────────────────────────────────────

export type LayerType   = 'shape' | 'text' | 'image' | 'video' | 'audio'
export type ShapeType   = 'rect'  | 'circle'
export type PlaybackAction = 'play' | 'pause' | 'stop' | 'reverse' | 'seek' | 'setValue'

/** Colour as four 0–255 channels — used for animated colour values */
export interface ColorValue { r: number; g: number; b: number; a: number }

/** 2D vector — used for animated position values */
export interface Vec2 { x: number; y: number }

export type AnimatableValue = number | boolean | string | ColorValue | Vec2

// ── Easing ────────────────────────────────────────────────────────────────────

export type EasingType =
  | 'linear' | 'hold'
  | 'easeIn' | 'easeOut' | 'easeInOut'
  | 'customBezier'

export interface EasingDefinition {
  type: EasingType
  /** Only used when type === 'customBezier' */
  bezier?: { cx1: number; cy1: number; cx2: number; cy2: number }
}

// ── Keyframe ──────────────────────────────────────────────────────────────────

export interface Keyframe {
  /** Stable UUID — identity key that survives timeMs changes during drag */
  id: string
  timeMs: number
  value: AnimatableValue
  easing: EasingDefinition
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export interface Track {
  /** e.g. "layers.card.opacity" | "layers.card.transform.x" */
  target: string
  label?: string
  keyframes: Keyframe[]
}

export interface TimelineMarker {
  id: string
  timeMs: number
  label: string
  color?: string
  type?: 'note' | 'beat' | 'scene' | 'export' | 'warning'
}

export interface TimelineSegment {
  id: string
  name: string
  startMs: number
  endMs: number
  color?: string
}

export interface Timeline {
  id: string
  durationMs: number
  autoplay: boolean
  loop: boolean
  /** 0 = infinite, N = play N times. Default 0. */
  loopCount?: number
  /** Play forward then backward. Default false. */
  pingPong?: boolean
  tracks: Track[]
  workAreaInMs?: number
  workAreaOutMs?: number
  markers?: TimelineMarker[]
  segments?: TimelineSegment[]
}

// ── Transform ─────────────────────────────────────────────────────────────────

export interface Transform {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotationDeg: number
  /** Pivot X for rotation and scale. Static — NOT animatable. */
  anchorX: number
  /** Pivot Y for rotation and scale. Static — NOT animatable. */
  anchorY: number
}

// ── Layer ─────────────────────────────────────────────────────────────────────

export interface Layer {
  id: string
  /** Human-friendly display name, e.g. "Logo", "Background" */
  name: string
  type: LayerType
  shape?: ShapeType
  /** Pivot for rotation/scale — set once in PropertiesPanel, NOT keyframed */
  transform: Transform
  opacity: number
  /** Canvas composite operation. Default 'source-over'. */
  blendMode?: GlobalCompositeOperation

  // ── Type-specific data ───────────────────────────────────────────────────
  style?:      ShapeStyle
  size?:       { width: number; height: number }
  text?:       TextStyle
  image?:      ImageData
  video?:      VideoData
  audio?:      AudioData
  effects?:    LayerEffects
  motionPath?: MotionPath

  // ── Timeline range ───────────────────────────────────────────────────────
  /** When layer becomes active. Default 0. */
  startMs?: number
  /** When layer deactivates. Default timeline.durationMs. */
  endMs?: number

  // ── Editor-only visual aid: a sub-grid drawn INSIDE the layer for
  //    pixel-precision design work. Optional; stripped from runtime export.
  internalGrid?: { size: number }

  // ── Editor meta (stripped on runtime export) ─────────────────────────────
  locked?:     boolean
  hidden?:     boolean
  solo?:       boolean
  colorLabel?: string  // e.g. '#3B82F6'
}

// ── Triggers & Bindings ───────────────────────────────────────────────────────

export interface TriggerAction {
  type: PlaybackAction
  timeline?: string
  key?: string
  value?: unknown
}

export interface Trigger {
  event: string
  actions: TriggerAction[]
}

export interface Binding {
  source: string
  target: string
  map: {
    inputMin: number; inputMax: number
    outputMin: number; outputMax: number
    clamp: boolean
  }
}

// ── Composition ───────────────────────────────────────────────────────────────

export interface Composition {
  id: string
  width: number
  height: number
  durationMs: number
  frameRate: number
  backgroundColor: string
}

// ── Root Scene ────────────────────────────────────────────────────────────────

export interface ChronoScene {
  formatVersion: '1.0.0'
  composition: Composition
  assets: Asset[]
  layers: Layer[]
  timelines: Timeline[]
  triggers: Trigger[]
  bindings: Binding[]
  initialState: Record<string, unknown>
}
