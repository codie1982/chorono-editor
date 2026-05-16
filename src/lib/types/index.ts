// ── Types barrel — re-export everything from sub-modules ─────────────────────

export type {
  LayerType, ShapeType, PlaybackAction,
  ColorValue, Vec2, AnimatableValue,
  EasingType, EasingDefinition,
  Keyframe,
  Track, TimelineMarker, TimelineSegment, Timeline,
  Transform,
  Layer,
  // Triggers (richer V1 model)
  TriggerEventType, TriggerEvent, TriggerConditionOp, TriggerCondition,
  TriggerActionType, TriggerAction, Trigger,
  // Bindings
  BindingSourceType, BindingTargetType, BindingSource, BindingTarget,
  BindingMap, Binding,
  // Scene Parameters
  SceneParameterType, SceneParameterValue, SceneParameter,
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
  ShapeStyle,
} from './style'

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
} from './effects'

export { buildEffectsFilter } from './effects'

export type {
  AnimatableGroup, AnimatableProperty,
  TimelineSettings,
  EditorSelection,
  CompositionPreset,
} from './editor'

export {
  ANIMATABLE_PROPERTIES,
  DEFAULT_TIMELINE_SETTINGS,
  COMPOSITION_PRESETS,
} from './editor'
