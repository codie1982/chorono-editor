import type {
  Layer, Timeline, Composition, ChronoScene, Transform,
  SceneParameter, SceneParameterType, SceneParameterValue,
  Trigger, Binding, TimelineSegment,
  PathStrokeData,
} from './types'

let layerCounter    = 0
let timelineCounter = 0
let kfCounter       = 0
let paramCounter    = 0
let triggerCounter  = 0
let bindingCounter  = 0
let segmentCounter  = 0

/** Generate a lightweight unique ID for keyframes (no crypto dependency). */
function nextKfId(): string {
  return `kf_${Date.now()}_${++kfCounter}`
}

export const DEFAULT_TRANSFORM: Transform = {
  x: 40, y: 40, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0,
}

export function newRectLayer(): Layer {
  layerCounter++
  const w = 160, h = 80
  return {
    id:   `rect_${layerCounter}`,
    name: `Rect ${layerCounter}`,
    type:  'shape',
    shape: 'rect',
    transform: {
      ...DEFAULT_TRANSFORM,
      x: 40 + (layerCounter % 5) * 20,
      y: 40 + (layerCounter % 5) * 20,
      // Anchor at layer centre — natural pivot for rotation / scale,
      // and gives the visible anchor handle a stable, predictable spot
      // instead of sitting on top of the move-by-grab area at top-left.
      anchorX: w / 2,
      anchorY: h / 2,
    },
    opacity: 1,
    style: {
      fill: { type: 'solid', color: '#3B82F6' },
      cornerRadius: 8,
    },
    size: { width: w, height: h },
  }
}

export function newCircleLayer(): Layer {
  layerCounter++
  const w = 60, h = 60
  return {
    id:   `circle_${layerCounter}`,
    name: `Circle ${layerCounter}`,
    type:  'shape',
    shape: 'circle',
    transform: {
      ...DEFAULT_TRANSFORM,
      x: 60 + (layerCounter % 5) * 20,
      y: 60 + (layerCounter % 5) * 20,
      anchorX: w / 2,
      anchorY: h / 2,
    },
    opacity: 1,
    style: {
      fill: { type: 'solid', color: '#EF4444' },
    },
    size: { width: w, height: h },
  }
}

export function newImageLayer(assetId: string, w = 200, h = 150): Layer {
  layerCounter++
  return {
    id:   `image_${layerCounter}`,
    name: `Image ${layerCounter}`,
    type: 'image',
    transform: { ...DEFAULT_TRANSFORM, x: 40, y: 40, anchorX: w / 2, anchorY: h / 2 },
    opacity: 1,
    size: { width: w, height: h },
    image: { assetId, objectFit: 'contain' },
  }
}

export function newVideoLayer(assetId: string, w = 320, h = 180, durationMs?: number): Layer {
  layerCounter++
  return {
    id:   `video_${layerCounter}`,
    name: `Video ${layerCounter}`,
    type: 'video',
    transform: { ...DEFAULT_TRANSFORM, x: 40, y: 40, anchorX: w / 2, anchorY: h / 2 },
    opacity: 1,
    size: { width: w, height: h },
    video: { assetId, volume: 1, muted: false, startOffsetMs: 0, loop: false },
    endMs: durationMs,
  }
}

export function newAudioLayer(assetId: string, durationMs?: number): Layer {
  layerCounter++
  return {
    id:   `audio_${layerCounter}`,
    name: `Audio ${layerCounter}`,
    type: 'audio',
    transform: { ...DEFAULT_TRANSFORM, x: 0, y: 0 },
    opacity: 1,
    // No size — audio has no visual representation on canvas
    audio: { assetId, volume: 1, muted: false, startOffsetMs: 0, loop: false },
    endMs: durationMs,
  }
}

export function newTextLayer(): Layer {
  layerCounter++
  const value = 'Chorono'
  const fontSize = 24
  // Text has no exact bounding box without measureText — approximate so the
  // anchor lands near the visual middle of the string. User can fine-tune
  // via the Centre button in PropertiesPanel.
  const estW = value.length * fontSize * 0.55
  const estH = fontSize
  return {
    id:   `text_${layerCounter}`,
    name: `Text ${layerCounter}`,
    type: 'text',
    transform: {
      ...DEFAULT_TRANSFORM,
      x: 50,
      y: 100 + (layerCounter % 5) * 20,
      anchorX: estW / 2,
      anchorY: estH / 2,
    },
    opacity: 1,
    text: { value, fontSize, color: '#FFFFFF' },
  }
}

export function newTimeline(): Timeline {
  timelineCounter++
  return {
    id: `timeline_${timelineCounter}`,
    durationMs: 1000,
    autoplay: true,
    loop: false,
    tracks: [],
  }
}

export const DEFAULT_COMPOSITION: Composition = {
  id: 'scene',
  width: 360,
  height: 240,
  durationMs: 1200,
  frameRate: 60,
  backgroundColor: '#0F172A',
}

export function emptyScene(): ChronoScene {
  return {
    formatVersion: '1.0.0',
    composition: { ...DEFAULT_COMPOSITION },
    assets: [],
    layers: [],
    timelines: [],
    triggers: [],
    bindings: [],
    parameters: [],
    initialState: {},
  }
}

// ── Interactive Runtime Factories ─────────────────────────────────────────────

/** PathStroke layer — defaults to a 200px circle with a thin white ring. */
export function newPathStrokeLayer(): Layer {
  layerCounter++
  const w = 200, h = 200
  const data: PathStrokeData = {
    path:   { shapeType: 'circle', width: w, height: h },
    stroke: { color: '#FFFFFF', width: 3, cap: 'round' },
    trim:   { mode: 'static', segmentLength: 0.2, offset: 0 },
  }
  return {
    id:   `pathStroke_${layerCounter}`,
    name: `Path ${layerCounter}`,
    type: 'pathStroke',
    transform: {
      ...DEFAULT_TRANSFORM,
      x: 80,
      y: 80,
      anchorX: w / 2,
      anchorY: h / 2,
    },
    opacity: 1,
    size: { width: w, height: h },
    pathStroke: data,
  }
}

/** SceneParameter — type-aware default value. */
const PARAM_DEFAULTS: Record<SceneParameterType, SceneParameterValue> = {
  string:  '',
  number:  0,
  boolean: false,
  color:   '#FFFFFF',
  image:   '',
}

export function newSceneParameter(type: SceneParameterType = 'number'): SceneParameter {
  paramCounter++
  const param: SceneParameter = {
    id:   `param_${paramCounter}`,
    name: `param${paramCounter}`,
    type,
    defaultValue: PARAM_DEFAULTS[type],
  }
  if (type === 'number') {
    param.min = 0
    param.max = 100
  }
  return param
}

/** Empty Trigger — defaults to a custom event with no actions. */
export function newTrigger(): Trigger {
  triggerCounter++
  return {
    id:   `trigger_${triggerCounter}`,
    label: `Rule ${triggerCounter}`,
    event: { type: 'customEvent', refId: 'event.name' },
    actions: [],
  }
}

/** Empty Binding — defaults to parameter → layer property. */
export function newBinding(): Binding {
  bindingCounter++
  return {
    id: `binding_${bindingCounter}`,
    source: { type: 'parameter' },
    target: { type: 'layerProperty' },
    map: {
      inputMin: 0, inputMax: 1,
      outputMin: 0, outputMax: 1,
      clamp: true,
    },
  }
}

export function newTimelineSegment(startMs: number, endMs: number): TimelineSegment {
  segmentCounter++
  return {
    id:    `segment_${segmentCounter}`,
    name:  `Segment ${segmentCounter}`,
    startMs,
    endMs,
    color: '#22D3EE',
  }
}

/**
 * Deep-clone a layer with a fresh id + offset name suffix. Used by the
 * duplicate-layer command (Cmd+D) and by stagger preset application.
 */
export function cloneLayerForDuplicate<L extends Layer>(layer: L): L {
  layerCounter++
  const cloned: L = JSON.parse(JSON.stringify(layer))
  cloned.id   = `${layer.type}_${layerCounter}`
  cloned.name = `${layer.name} Copy`
  return cloned
}

// ── Keyframe factory ──────────────────────────────────────────────────────────

export { nextKfId }
