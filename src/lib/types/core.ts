// ── Core Scene Types ──────────────────────────────────────────────────────────
// The data model shared between builder, evaluator, renderer, and runtime JSON.

import type { ShapeStyle }  from './style'
import type { TextStyle }   from './text'
import type { ImageData, VideoData, AudioData, Asset } from './media'
import type { LayerEffects, MotionPath } from './effects'

// ── Primitives ────────────────────────────────────────────────────────────────

export type LayerType   = 'shape' | 'text' | 'image' | 'video' | 'audio' | 'pathStroke'
export type ShapeType   = 'rect'  | 'circle'
export type PlaybackAction =
  | 'play' | 'pause' | 'stop' | 'reverse' | 'seek' | 'setValue'
  | 'playSegment' | 'setParam' | 'emitEvent'

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

  // ── Path Stroke (layer.type === 'pathStroke') ────────────────────────────
  pathStroke?: PathStrokeData

  // ── Interactive runtime ──────────────────────────────────────────────────
  /** When true, runtime hit-testing will fire 'click' triggers on this layer. */
  tappable?: boolean
  /** Map of property dot-paths → parameter id. Resolved at evaluation time. */
  paramBindings?: Record<string, string>

  // ── Editor-only visual aid: a sub-grid drawn INSIDE the layer for
  //    pixel-precision design work. Optional; stripped from runtime export.
  internalGrid?: { size: number }

  // ── Editor meta (stripped on runtime export) ─────────────────────────────
  locked?:     boolean
  hidden?:     boolean
  solo?:       boolean
  colorLabel?: string  // e.g. '#3B82F6'
}

// ── Scene Parameters ──────────────────────────────────────────────────────────

export type SceneParameterType  = 'string' | 'number' | 'boolean' | 'color' | 'image'
export type SceneParameterValue = string | number | boolean

export interface SceneParameter {
  id: string
  name: string
  type: SceneParameterType
  defaultValue: SceneParameterValue
  /** Optional min/max for number params (drives preview slider range). */
  min?: number
  max?: number
}

// ── Path Stroke Layer Data ────────────────────────────────────────────────────

export type PathShapeType = 'ellipse' | 'circle' | 'rect' | 'custom'
export type StrokeCap     = 'butt' | 'round' | 'square'
export type PathTrimMode  = 'static' | 'movingSegment'

export interface PathStrokeDefinition {
  shapeType: PathShapeType
  /** For ellipse / rect / circle (= width=height). Required for those shapes. */
  width?: number
  height?: number
  /** For shapeType === 'custom': SVG path string. */
  customPath?: string
}

export interface PathStrokeGlow {
  color: string
  blur: number
}

export interface PathStrokeStyle {
  color: string
  width: number
  cap?: StrokeCap
  glow?: PathStrokeGlow
}

export interface PathTrim {
  mode: PathTrimMode
  /** 0–1: visible segment length as a fraction of total path. Default 0.2. */
  segmentLength?: number
  /** 0–1: animated. Track this via 'layers.<id>.pathStroke.trim.offset'. */
  offset: number
}

export interface PathStrokeData {
  path:   PathStrokeDefinition
  stroke: PathStrokeStyle
  trim:   PathTrim
}

// ── Triggers ──────────────────────────────────────────────────────────────────

export type TriggerEventType =
  // User interaction
  | 'click' | 'dragStart' | 'dragMove' | 'dragEnd'
  // Timeline / animation lifecycle
  | 'animationStart'
  | 'animationComplete'
  | 'animationLoop'
  | 'segmentStart'
  | 'segmentComplete'
  // Layer lifecycle
  | 'layerAppear'
  | 'layerDisappear'
  | 'layerAnimationComplete'
  // Other
  | 'markerReached'
  | 'frameReached'
  | 'customEvent'

export interface TriggerEvent {
  type: TriggerEventType
  /** For click / drag / layer* / layerClick: which layer. */
  layerId?: string
  /** For segmentStart / segmentComplete: which segment. */
  segmentId?: string
  /** For animation* events: which timeline. */
  timelineId?: string
  /** For markerReached: marker id. For customEvent: event name. */
  refId?: string
  /** For frameReached: zero-based frame index inside the active timeline. */
  frameNumber?: number
}

export type TriggerConditionOp = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte'

export interface TriggerCondition {
  /** Dot-path into runtime state, e.g. 'params.score'. */
  path: string
  op:   TriggerConditionOp
  value: number | boolean | string
}

export type TriggerActionType =
  | 'play' | 'pause' | 'stop' | 'reverse' | 'seek'
  | 'playSegment' | 'setParam' | 'emitEvent'

export interface TriggerAction {
  type: TriggerActionType
  timelineId?: string
  /** For seek: target time in ms. */
  timeMs?: number
  /** For playSegment: target segment id. */
  segmentId?: string
  /** For playSegment: optional loop flag (default false). */
  loop?: boolean
  /** For setParam: target parameter id. */
  paramId?: string
  /** For setParam: value to write. */
  paramValue?: SceneParameterValue
  /** For emitEvent: custom event name to emit. */
  eventName?: string
}

export interface Trigger {
  id: string
  /** Optional human label shown in Events panel. */
  label?: string
  event: TriggerEvent
  condition?: TriggerCondition
  actions: TriggerAction[]
}

// ── Bindings (motion binding / parameter binding) ─────────────────────────────

export type BindingSourceType = 'layerProperty' | 'parameter'
export type BindingTargetType = 'layerProperty' | 'timelineProgress' | 'parameter'

export interface BindingSource {
  type: BindingSourceType
  layerId?: string
  /** Dot-path e.g. 'transform.x', 'opacity', 'style.fill.color'. */
  property?: string
  paramId?: string
}

export interface BindingTarget {
  type: BindingTargetType
  layerId?: string
  property?: string
  timelineId?: string
  paramId?: string
}

export interface BindingMap {
  inputMin: number
  inputMax: number
  outputMin: number
  outputMax: number
  /** Clamp output to [outputMin, outputMax]. Default true. */
  clamp?: boolean
  /** Reverse the mapping (outputMax becomes the low end). Default false. */
  reverse?: boolean
}

export interface Binding {
  id: string
  source: BindingSource
  target: BindingTarget
  map: BindingMap
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
  /** Runtime-tunable parameters. Surfaced via setParam() on the host platform. */
  parameters: SceneParameter[]
  triggers: Trigger[]
  bindings: Binding[]
  initialState: Record<string, unknown>
}
