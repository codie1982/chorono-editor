// ── Types barrel — re-export everything from sub-modules ─────────────────────

export type {
  LayerType, ShapeType, ShapeKind, ShapeParams, PlaybackAction,
  ColorValue, Vec2, AnimatableValue,
  EasingType, EasingDefinition,
  TangentMode,
  Keyframe,
  Track, TimelineMarker, TimelineSegment, Timeline,
  Transform,
  Layer,
  // Triggers (richer V1 model)
  TriggerEventType, TriggerEvent, TriggerConditionOp, TriggerCondition,
  TriggerActionType, TriggerAction, Trigger, ParamValueSource,
  // Bindings
  BindingSourceType, BindingTargetType, BindingSource, BindingTarget,
  BindingMap, Binding,
  // Parameter Wires (BL-05)
  ParameterWire, ParameterRef, ParameterValueType, ParameterWireClamp,
  // Scene Parameters
  SceneParameterType, SceneParameterValue, SceneParameter,
  // Repeater
  RepeaterMode, RepeaterTransformStep, RepeaterPolarParams, RepeaterLayerData,
  // Drag (interactive)
  DragAxis, DragConfig,
  // Path Stroke Layer
  PathShapeType, StrokeCap, PathTrimMode,
  PathStrokeDefinition, PathStrokeGlow, PathStrokeStyle,
  PathTrim, PathStrokeData,
  Composition,
  ChronoScene,
} from './core'

// ── State Machine (BL-09) ───────────────────────────────────────────────────
export type {
  BaseSMState, BaseSMTransition, SMGuard, SMAction,
} from './statemachine-base'
export type {
  ChronoSMState, StateMachineDefinition,
} from './statemachine-chorono'

export type {
  GradientStop, GradientFill,
  ShapeFill,
  StrokeAlignment, LineCap, LineJoin, ShapeStroke,
  TrimPathDefinition,
  ShapeStyle,
} from './style'

export type {
  PathAnchor, BezierPath,
} from './path'

export { pathFromPoints, DEFAULT_BEZIER_PATH } from './path'

export type { MaskMode, MaskDefinition } from './mask'

export type {
  FontWeight, FontStyle, TextAlign,
  TextStroke, TextShadow,
  TextStyle,
} from './text'

export type {
  ObjectFit,
  ImageData, VideoData, AudioData,
  AssetType, Asset,
} from './media'

export type {
  LayerEffects,
  MotionPath,
  PluginEffect,
  FollowPath,
} from './effects'

export { buildEffectsFilter } from './effects'

export type {
  AnimatableGroup, AnimatableProperty,
  TimelineMode, AutoKeyMode,
  TimelineSettings,
  EditorSelection,
  CompositionPreset,
} from './editor'

export {
  ANIMATABLE_PROPERTIES,
  isPropertyAnimatableOn,
  DEFAULT_TIMELINE_SETTINGS,
  COMPOSITION_PRESETS,
} from './editor'

// ── Track Type Architecture (BL-35) ─────────────────────────────────────────
// Re-export the discriminated track union and guards so consumers don't
// need to know which submodule owns the types.
export type {
  TrackKind, TrackBase, PropertyTrack, EventTrack, AudioTrack,
  MarkerTrack, StateTrack, TriggerTrack, AnyTrack,
  TimelineEvent, StateRegion, TriggerRegion,
} from '../timeline/tracks'
export {
  isPropertyTrack, isEventTrack, isAudioTrack,
  isMarkerTrack, isStateTrack, isTriggerTrack,
  asPropertyTrack, propertyTracksOf,
} from '../timeline/tracks'

// ── Curve Modifier Stack (BL-46) ────────────────────────────────────────────
export type {
  CurveModifierType, CurveBlendMode, CurveModifier, CurveModifierContext,
} from '../animation/modifiers/types'
export { defaultParametersFor } from '../animation/modifiers/builtins'
export { applyModifiers, blendModifierValue, hashTrackSeed } from '../animation/modifiers/pipeline'

// ── Ease / TimeWarp / Multiplier curves (BL-48) ─────────────────────────────
export type { BezierTuple } from '../animation/timeWarp/types'
export { IDENTITY_BEZIER } from '../animation/timeWarp/types'
export { sampleBezier } from '../animation/timeWarp/sampler'

// ── Procedural Track Controllers (BL-50) ────────────────────────────────────
export type {
  WaveformShape, WaveformControllerParams,
  NoiseControllerParams, TrackController,
} from '../animation/controllers/types'
export {
  DEFAULT_WAVEFORM_PARAMS, DEFAULT_NOISE_PARAMS,
} from '../animation/controllers/types'
export {
  sampleController, sampleWaveform, sampleNoise,
} from '../animation/controllers/sample'

// ── Baking & Simplification (BL-51) ─────────────────────────────────────────
export type { BakeOptions } from '../animation/baking/bake'
export { bakeTrack, bakeTrackToKeyframes, sampleTrackDense } from '../animation/baking/bake'
export { simplifyRDP } from '../animation/baking/simplify'

// ── Particle Effect Engine (BL-13) ───────────────────────────────────────────
export type {
  RangeNumber, RangeOrFixed,
  EmitterMode, EmitterShape, EmitterArea,
  ParticleEmitterConfig,
  ParticleShape, ParticleColorMode,
  ParticleStrokeConfig, ParticleVisualConfig,
  ParticleRandomConfig,
  ParticleEmitterData,
  ParticleLifeGradient, LifeGradientStop,
  MotionModifierType, MotionModifierConfig,
  ParticleAnimationConfig,
  ParticleBurstMarker,
  ParticleBlendMode, ParticleGlowConfig, ParticleBlurConfig,
  ParticleRenderingConfig,
  ParticleChannels,
} from '../particles/types'
