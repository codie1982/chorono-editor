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
  TimelineMode,
  TimelineSettings,
  EditorSelection,
  CompositionPreset,
} from './editor'

export {
  ANIMATABLE_PROPERTIES,
  DEFAULT_TIMELINE_SETTINGS,
  COMPOSITION_PRESETS,
} from './editor'
