// ── Core Scene Types ──────────────────────────────────────────────────────────
// The data model shared between builder, evaluator, renderer, and runtime JSON.

import type { ShapeStyle }  from './style'
import type { TextStyle }   from './text'
import type { ImageData, VideoData, AudioData, Asset } from './media'
import type { LayerEffects, MotionPath, PluginEffect, FollowPath, MotionBlurConfig } from './effects'
import type { BezierPath } from './path'
import type { MaskDefinition } from './mask'
import type { OutOfRangeSettings } from '../animation/out-of-range/types'
import type { StateMachineDefinition } from './statemachine-chorono'

// ── Primitives ────────────────────────────────────────────────────────────────

export type LayerType   = 'shape' | 'text' | 'image' | 'video' | 'audio' | 'pathStroke' | 'path' | 'group' | 'repeater' | 'particleEmitter'
export type ShapeType   = 'rect'  | 'circle'
export type PlaybackAction =
  | 'play' | 'pause' | 'stop' | 'reverse' | 'seek' | 'setValue'
  | 'playSegment' | 'setParam' | 'emitEvent'

// ── Shape system ──────────────────────────────────────────────────────────────

/** Extended shape kinds. Existing 'rect'/'circle' kept for backward compat via ShapeType. */
export type ShapeKind =
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'polygon'
  | 'star'
  | 'ring'
  | 'arc'
  | 'capsule'
  | 'spiral'   // BL-24
  | 'wave'     // BL-24
  | 'blob'     // BL-24

/** Shape-specific geometry parameters. All fields optional — defaults live in renderer/factory. */
export interface ShapeParams {
  kind: ShapeKind
  /** polygon: edge count (3–12). star: point count (3–12). blob: vertex count (5–64). */
  sides?: number
  /** star: inner arm radius (px). ring: hole radius (px). */
  innerRadius?: number
  /** star: outer tip radius (px). Falls back to min(width,height)/2. */
  outerRadius?: number
  /** polygon/star corner roundness 0–1. */
  roundness?: number
  /** ring/arc: start angle in degrees (0 = 12 o'clock). */
  startAngle?: number
  /** ring/arc: end angle in degrees. */
  endAngle?: number
  /** line/arrow: endpoint X in layer-local coordinates. */
  x2?: number
  /** line/arrow: endpoint Y in layer-local coordinates. */
  y2?: number
  /** arrow: arrowhead length in px. */
  arrowHeadSize?: number

  // ── BL-24: Spiral ───────────────────────────────────────────────────────────
  /** spiral: turn count (default 3, min 0.5, max 20). */
  turns?: number
  /** spiral: starting radius from center in px (default 4). */
  startRadius?: number
  /** spiral: ending radius from center in px (default min(w,h)/2). */
  endRadius?: number
  /** spiral: radius interpolation exponent (1=linear, <1 looser outer, >1 tighter inner). */
  tightness?: number

  // ── BL-24: Wave ─────────────────────────────────────────────────────────────
  /** wave: peak amplitude in px (default h/4). */
  amplitude?: number
  /** wave: full cycle count across width (default 2, min 0.1, max 50). */
  frequency?: number
  /** wave: phase offset in radians (default 0, animatable). */
  phase?: number

  // ── BL-24: Blob ─────────────────────────────────────────────────────────────
  /** blob: noise ratio 0–1 (default 0.4). */
  irregularity?: number
  /** blob: deterministic seed integer (default 42). NOT animatable — would jump per frame. */
  seed?: number
}

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

/**
 * How the in / out bezier handles of a customBezier easing behave when one
 * of them is dragged.
 *   • broken  — handles are fully independent (default; what we shipped first)
 *   • aligned — dragging one handle mirrors the other across the keyframe so
 *               the curve passes through smoothly (continuous tangent)
 *   • auto    — handles are computed from neighbouring keyframes — user
 *               doesn't edit them at all. (Sprint 3 reserves the field but
 *               the auto-tangent solver lands in a later sprint.)
 *   • linear  — segment renders as a straight line; bezier handles ignored
 *
 * Stored per-keyframe so different segments can have different curve
 * characters in the same track.
 */
export type TangentMode = 'broken' | 'aligned' | 'auto' | 'linear'

export interface Keyframe {
  /** Stable UUID — identity key that survives timeMs changes during drag */
  id: string
  timeMs: number
  value: AnimatableValue
  easing: EasingDefinition
  /** Bezier-handle linkage mode. Defaults to 'broken' when undefined. */
  tangentMode?: TangentMode
  /** BL-46 — modifiers scoped to the segment from THIS keyframe to the
   *  NEXT keyframe in time. Empty / undefined = no modifiers on this
   *  segment. The last keyframe's segmentModifiers is unused (no next
   *  segment exists). Stored on the leading kf rather than as a separate
   *  KeyframeSegment entity so kf delete naturally removes the segment. */
  segmentModifiers?: import('../animation/modifiers/types').CurveModifier[]
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export interface Track {
  /** e.g. "layers.card.opacity" | "layers.card.transform.x" */
  target: string
  label?: string
  keyframes: Keyframe[]
  /** Track-kind discriminator (BL-35). Optional for backward compat:
   *  legacy tracks without a `kind` are treated as 'property'. See
   *  `src/lib/timeline/tracks.ts` for the full union (event / audio /
   *  marker / state / trigger track types). */
  kind?: 'property'
  /** Out-of-range behavior (BL-45). Defines what happens before first keyframe
   *  and after last keyframe (Constant, Cycle, Loop, PingPong, Linear, RelativeRepeat).
   *  Optional for backward compat: undefined defaults to constant/constant. */
  outOfRange?: OutOfRangeSettings
  /** BL-46 — modifiers scoped to the WHOLE track. Applied AFTER keyframe
   *  interpolation, AFTER out-of-range resolution, AFTER segment-scoped
   *  modifiers. Use for "noise on the whole rotation track" or "clamp
   *  opacity to [0,1] no matter what the upstream is producing". */
  modifiers?: import('../animation/modifiers/types').CurveModifier[]
  /** BL-48 — Ease Curve: re-times the whole track via a cubic-bezier.
   *  Applied to localT BEFORE keyframe interpolation. A slow-start curve
   *  makes the entire animation appear to start slow. */
  easeCurve?: import('../animation/timeWarp/types').BezierTuple
  /** BL-48 — TimeWarp: secondary time remap applied AFTER easeCurve.
   *  Composes with easeCurve as `timeWarp(easeCurve(localT))`. Lets the
   *  user stack two layers of timing control (e.g., master ease + per-
   *  section warp without disturbing each other). */
  timeWarp?: import('../animation/timeWarp/types').BezierTuple
  /** BL-48 — Multiplier Curve: scales the post-modifier value by a
   *  bezier sampled at localT. `multiplierAmplitude` (default 1) controls
   *  how much the curve influences the value:
   *      value' = value * (1 + (bezier(localT) - 0.5) * amplitude * 2)
   *  Amplitude 0 = no effect; 1 = bezier ∈ [0,1] becomes scale ∈ [0,2]. */
  multiplierCurve?: import('../animation/timeWarp/types').BezierTuple
  multiplierAmplitude?: number
  /** BL-50 — Procedural controller. When set, the track ignores its
   *  `keyframes` array and sources value from a formula (waveform / noise).
   *  Backward compat: undefined → keyframe controller (existing behavior).
   *  Track modifiers + multiplier curve + out-of-range still apply on top
   *  of the procedural output. */
  controller?: import('../animation/controllers/types').TrackController
  // TODO(big-feature): expression / compound / layered controllers —
  //   keyframe controller. Adding `controller?: 'keyframe' | 'expression'
  //   | 'noise' | 'wave' | 'spring'` would let a property be driven by a
  //   formula or procedural source instead of (or alongside) keyframes.
  //   Renderer would dispatch per controller type; UI would offer a
  //   "Convert Controller" submenu.
}

// TODO(big-feature): Vec2 / multi-channel tracks.
//   Currently `transform.x` and `transform.y` are TWO separate tracks; a
//   single position keyframe requires editing both in sync. A v2 model
//   could introduce vec2 / color-valued keyframes (value: Vec2 | ColorValue)
//   with the Curve Editor splitting them into per-channel curves visually
//   while the data stays unified. Migration is non-trivial (every reader of
//   `evaluateTrack` returns number today) so this is a dedicated sprint.

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
  /** BL-36 — discrete event markers fired when the playhead crosses them
   *  (e.g. playSound, emitParticles, openModal). Imported via the AnyTrack
   *  union when displayed but stored separately so existing scene data
   *  doesn't need migration. */
  events?: import('../timeline/tracks').TimelineEvent[]
  /** Explicit list of layer IDs that appear in this timeline's track view.
   * undefined = legacy / "show all layers" (backward compat).
   * [] = new timeline with no layers yet; layers must be dragged in. */
  layerIds?: string[]
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
//
// TODO(big-feature): Layer modifiers (AE / SVGator-style).
//   Add an optional `modifiers?: LayerModifier[]` field — each modifier
//   transforms how the layer renders without baking new geometry:
//     • Trim Path     (start/end %)
//     • Repeat        (N copies, transform step)
//     • Follow Path   (lay layer along a path)
//     • Shadow / Blur / Glow (effects beyond `effects.blur`)
//   Renderer applies modifiers in order, mutating the layer's draw context.
//   UI: right-click layer → "Add Modifier ▶" submenu in LayerPanel.

export interface Layer {
  id: string
  /** Human-friendly display name, e.g. "Logo", "Background" */
  name: string
  type: LayerType
  /** Legacy shape discriminator kept for backward compat. Prefer shapeKind for new shapes. */
  shape?: ShapeType
  /** Extended shape kind — used for all shapes beyond 'rect' and 'circle'. */
  shapeKind?: ShapeKind
  /** Shape-specific geometry parameters (sides, radii, angles, endpoints…). */
  shapeParams?: ShapeParams
  /** Bezier path data — used when type === 'path'. Editable via Pen Tool. */
  path?: BezierPath
  /**
   * Visual vs motion guide path. Defaults to 'visual' when type === 'path'.
   * Motion paths are not rendered as visible strokes during playback — they
   * exist purely to drive `followPath` on other layers.
   */
  pathRole?: 'visual' | 'motion'
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
  /** Plugin-based effect chain (glow/shadow/etc.) applied AFTER rendering. */
  effectsChain?: PluginEffect[]
  /** Temporal trail effect driven by layer velocity. See renderMotionBlurTrails. */
  motionBlur?: MotionBlurConfig
  motionPath?: MotionPath
  /** Drives layer position from another path layer's geometry. */
  followPath?: FollowPath

  // ── Timeline range ───────────────────────────────────────────────────────
  /** When layer becomes active. Default 0. */
  startMs?: number
  /** When layer deactivates. Default timeline.durationMs. */
  endMs?: number

  // ── Path Stroke (layer.type === 'pathStroke') ────────────────────────────
  pathStroke?: PathStrokeData

  // ── Scene Graph ──────────────────────────────────────────────────────────
  /** Parent group layer id. undefined / null = root layer. */
  parentId?: string
  /** Group masks: ids of layers to be used as masks on THIS layer. */
  masks?: MaskDefinition[]
  /** Repeater config — only used when type === 'repeater'. */
  repeater?: RepeaterLayerData

  // ── Particle Emitter (BL-13) ─────────────────────────────────────────────
  /** Particle emitter config — only used when type === 'particleEmitter'. */
  particleEmitter?: import('../particles/types').ParticleEmitterData

  // ── Interactive runtime ──────────────────────────────────────────────────
  /** When true, runtime hit-testing will fire 'click' triggers on this layer. */
  tappable?: boolean
  /** Map of property dot-paths → parameter id. Resolved at evaluation time. */
  paramBindings?: Record<string, string>
  /**
   * When true, pointerdown on this layer in preview mode starts a drag —
   * fires dragStart / dragMove / dragEnd trigger events. Progress (0-1) is
   * computed from the drag delta vs dragRange.
   */
  draggable?: boolean
  /** Drag config — only used when draggable: true. */
  dragConfig?: DragConfig

  // ── Editor-only visual aid: a sub-grid drawn INSIDE the layer for
  //    pixel-precision design work. Optional; stripped from runtime export.
  internalGrid?: { size: number }

  // ── Editor meta (stripped on runtime export) ─────────────────────────────
  locked?:     boolean
  hidden?:     boolean
  solo?:       boolean
  /** Pinned layers stick to the top of the timeline list, scroll-independent.
   *  Useful for keeping a controller / camera / master layer always visible. */
  pinned?:     boolean
  colorLabel?: string  // e.g. '#3B82F6'
  /** BL-55 — 3ds Max-style freeze: layer remains visible on canvas but is
   *  not selectable, not editable, and rendered translucent. Different from
   *  `locked` (which keeps the layer fully opaque + selectable for inspection). */
  frozen?:     boolean
  /**
   * BL-59 Phase 3 — Live instance reference. When set, this layer is a
   * THIN reference to another layer (the source):
   *   - Geometry / style / size / text / image / path / etc. come from the
   *     source at RENDER time (so source edits propagate live).
   *   - Transform / opacity / parentId / effects / id / name stay on THIS
   *     layer (each instance can sit anywhere with its own opacity).
   *
   * Instance layers have no shape / path / size of their own — those
   * fields are deliberately stripped at creation time (CloneSingleLayer
   * with mode='instance'). Resolution lives in
   * `src/lib/clone/InstanceResolver.ts`.
   *
   * If the source is missing (deleted), the renderer skips the instance
   * and bbox/hit-test treat it as empty.
   */
  instanceOf?: string
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

// ── Drag Config ───────────────────────────────────────────────────────────────

export type DragAxis = 'x' | 'y' | 'both'

export interface DragConfig {
  /** Which axes contribute to the progress value. Default 'both'. */
  axis?: DragAxis
  /**
   * Max drag distance (px) at which progress = 1. Default 200.
   * For axis='both', uses Math.hypot(dx, dy).
   */
  range?: number
  /**
   * When true, the dragged layer's transform.x/y follows the cursor during
   * drag (visual slider/knob feedback). Constrained to axis.
   * Default false (events fire but layer stays still).
   */
  followCursor?: boolean
  /**
   * Parameter id to set with normalized progress (0-1) on every dragMove.
   * Lets the drag DIRECTLY drive a scene parameter without needing a trigger.
   * Optional — when set, the parameter is updated automatically.
   */
  setsParameter?: string
  /**
   * Timeline id whose playhead is driven by the drag.
   *
   * Each dragMove sets `currentTime = progress * timeline.durationMs`, so
   * every keyframe on that timeline scrubs in sync with the drag. Use this
   * to build "scrub-controlled" interactions:
   *   "Drag this box down → text blur ramps up" — animate blur on Timeline 1,
   *   then point the box's scrubsTimeline at Timeline 1.
   */
  scrubsTimeline?: string
}

// ── Repeater Layer Data ───────────────────────────────────────────────────────

export type RepeaterMode = 'linear' | 'polar'

export interface RepeaterTransformStep {
  x?:        number
  y?:        number
  rotation?: number
  scaleX?:   number
  scaleY?:   number
  opacity?:  number
}

export interface RepeaterPolarParams {
  radius:        number
  startAngle:    number
  endAngle:      number
  orientToAngle?: boolean
}

export interface RepeaterLayerData {
  /** Layer id whose visual is being repeated. */
  sourceLayerId: string
  count:         number
  mode:          RepeaterMode
  transformStep?: RepeaterTransformStep
  polar?:        RepeaterPolarParams
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

/**
 * For setParam actions, a dynamic value source pulled from the firing
 * RuntimeEvent's payload (drag deltas + progress). When set, overrides the
 * static `paramValue`. Lets drag events drive scene parameters declaratively.
 */
export type ParamValueSource = 'event.progress' | 'event.dx' | 'event.dy'

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
  /** For setParam: STATIC value to write. Used when paramValueFrom is unset. */
  paramValue?: SceneParameterValue
  /**
   * For setParam: DYNAMIC value source — reads from the firing event's data.
   *   'event.progress' — drag progress 0–1 (dragMove)
   *   'event.dx'       — raw horizontal drag delta in composition px
   *   'event.dy'       — raw vertical drag delta
   * When set, takes priority over `paramValue`.
   */
  paramValueFrom?: ParamValueSource
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

// ── Parameter Wires (BL-05) ───────────────────────────────────────────────────
// Expression-based parameter bindings — formula-driven (e.g. "map(s, 0, 1, 0, 360)")
// rather than the linear inputMin/outputMax remap of `Binding`. Source/target
// references are STRUCTURED (ParameterRef) so the UI can present typed pickers
// rather than free-text strings.

export type ParameterValueType = 'number' | 'boolean' | 'string' | 'color' | 'vec2'

export interface ParameterRef {
  /** Layer this property belongs to. Absent → top-level scene parameter. */
  layerId?: string
  /** Modifier instance within a layer (reserved for future modifier wiring). */
  modifierId?: string
  /** Dot-path within the layer/modifier (e.g. "transform.rotationDeg", "opacity"),
   *  or — for scene parameters — the parameter id alone. */
  propertyPath: string
  /** Coarse type of the referenced value. Drives picker filtering + UI labels. */
  valueType: ParameterValueType
}

export interface ParameterWireClamp {
  enabled: boolean
  min?: number
  max?: number
}

export interface ParameterWire {
  id: string
  /** Optional user-given name; falls back to formatParameterRef(source→target). */
  name?: string
  enabled: boolean
  source: ParameterRef
  target: ParameterRef
  /** Whitelist-only expression evaluated each frame with `source` bound to the
   *  source value. See src/lib/core/expression/expressionEvaluator.ts. */
  expression: string
  /** Replacement semantics. 'override' (default) writes the result outright;
   *  'add' will be the additive sum once multi-wire blending lands. MVP only
   *  uses 'override'. */
  blendMode: 'override' | 'add'
  /** Optional output clamp — applied AFTER the expression evaluates. */
  clamp?: ParameterWireClamp
  /** Epoch ms timestamps for sorting + audit. */
  createdAt: number
  updatedAt: number
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
  /** Expression-based parameter wires (BL-05). Optional for backward compat;
   *  legacy scenes without this field continue to work unchanged. */
  parameterWires?: ParameterWire[]
  /** Interactive state machines (BL-09). Each state binds to a timeline;
   *  transitions switch the active playhead. Optional for backward compat. */
  stateMachines?: StateMachineDefinition[]
  initialState: Record<string, unknown>
}
