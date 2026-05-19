import type {
  Layer, Timeline, Composition, ChronoScene, Transform,
  SceneParameter, SceneParameterType, SceneParameterValue,
  Trigger, Binding, ParameterWire, TimelineSegment, TimelineMarker,
  PathStrokeData,
} from './types'

let layerCounter    = 0
let timelineCounter = 0
let kfCounter       = 0
let paramCounter    = 0
let triggerCounter  = 0
let bindingCounter  = 0
let wireCounter     = 0
let segmentCounter  = 0
let eventCounter    = 0
let markerCounter   = 0

/** Generate a lightweight unique ID for keyframes (no crypto dependency). */
function nextKfId(): string {
  return `kf_${Date.now()}_${++kfCounter}`
}

/** Generate a unique ID for a timeline event (BL-36). */
export function nextEventId(): string {
  return `ev_${Date.now()}_${++eventCounter}`
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

// ── New shape factories (V1 expansion) ────────────────────────────────────────

export function newEllipseLayer(): Layer {
  layerCounter++
  const w = 120, h = 80
  return {
    id:        `ellipse_${layerCounter}`,
    name:      `Ellipse ${layerCounter}`,
    type:       'shape',
    shapeKind:  'ellipse',
    shapeParams:{ kind: 'ellipse' },
    transform: { ...DEFAULT_TRANSFORM,
                 x: 60 + (layerCounter % 5) * 20, y: 60 + (layerCounter % 5) * 20,
                 anchorX: w / 2, anchorY: h / 2 },
    opacity: 1,
    style:   { fill: { type: 'solid', color: '#8B5CF6' } },
    size:    { width: w, height: h },
  }
}

export function newLineLayer(): Layer {
  layerCounter++
  const x2 = 160, y2 = 0
  return {
    id:        `line_${layerCounter}`,
    name:      `Line ${layerCounter}`,
    type:       'shape',
    shapeKind:  'line',
    shapeParams:{ kind: 'line', x2, y2 },
    transform: { ...DEFAULT_TRANSFORM, x: 60, y: 100 + (layerCounter % 5) * 20 },
    opacity: 1,
    style:   { stroke: { color: '#94A3B8', width: 3, lineCap: 'round' } },
    size:    { width: Math.abs(x2), height: Math.max(1, Math.abs(y2)) },
  }
}

export function newArrowLayer(): Layer {
  layerCounter++
  const x2 = 140, y2 = 0
  return {
    id:        `arrow_${layerCounter}`,
    name:      `Arrow ${layerCounter}`,
    type:       'shape',
    shapeKind:  'arrow',
    shapeParams:{ kind: 'arrow', x2, y2, arrowHeadSize: 14 },
    transform: { ...DEFAULT_TRANSFORM, x: 60, y: 120 + (layerCounter % 5) * 20 },
    opacity: 1,
    style:   { stroke: { color: '#F59E0B', width: 3, lineCap: 'round', lineJoin: 'round' } },
    size:    { width: Math.abs(x2), height: Math.max(1, Math.abs(y2)) },
  }
}

export function newPolygonLayer(): Layer {
  layerCounter++
  const w = 120, h = 120
  return {
    id:        `polygon_${layerCounter}`,
    name:      `Polygon ${layerCounter}`,
    type:       'shape',
    shapeKind:  'polygon',
    shapeParams:{ kind: 'polygon', sides: 6 },
    transform: { ...DEFAULT_TRANSFORM,
                 x: 60 + (layerCounter % 5) * 20, y: 60 + (layerCounter % 5) * 20,
                 anchorX: w / 2, anchorY: h / 2 },
    opacity: 1,
    style:   { fill: { type: 'solid', color: '#10B981' } },
    size:    { width: w, height: h },
  }
}

export function newStarLayer(): Layer {
  layerCounter++
  const w = 120, h = 120
  return {
    id:        `star_${layerCounter}`,
    name:      `Star ${layerCounter}`,
    type:       'shape',
    shapeKind:  'star',
    shapeParams:{ kind: 'star', sides: 5, innerRadius: 27, outerRadius: 60 },
    transform: { ...DEFAULT_TRANSFORM,
                 x: 60 + (layerCounter % 5) * 20, y: 60 + (layerCounter % 5) * 20,
                 anchorX: w / 2, anchorY: h / 2 },
    opacity: 1,
    style:   { fill: { type: 'solid', color: '#F59E0B' } },
    size:    { width: w, height: h },
  }
}

export function newRingLayer(): Layer {
  layerCounter++
  const w = 100, h = 100
  return {
    id:        `ring_${layerCounter}`,
    name:      `Ring ${layerCounter}`,
    type:       'shape',
    shapeKind:  'ring',
    shapeParams:{ kind: 'ring', innerRadius: 30, startAngle: 0, endAngle: 360 },
    transform: { ...DEFAULT_TRANSFORM,
                 x: 60 + (layerCounter % 5) * 20, y: 60 + (layerCounter % 5) * 20,
                 anchorX: w / 2, anchorY: h / 2 },
    opacity: 1,
    style:   { fill: { type: 'solid', color: '#3B82F6' } },
    size:    { width: w, height: h },
  }
}

export function newArcLayer(): Layer {
  layerCounter++
  const w = 100, h = 100
  return {
    id:        `arc_${layerCounter}`,
    name:      `Arc ${layerCounter}`,
    type:       'shape',
    shapeKind:  'arc',
    shapeParams:{ kind: 'arc', startAngle: -90, endAngle: 90 },
    transform: { ...DEFAULT_TRANSFORM,
                 x: 60 + (layerCounter % 5) * 20, y: 60 + (layerCounter % 5) * 20,
                 anchorX: w / 2, anchorY: h / 2 },
    opacity: 1,
    // Arcs default to stroke-only — they are unfilled curves.
    style:   { stroke: { color: '#06B6D4', width: 4, lineCap: 'round' } },
    size:    { width: w, height: h },
  }
}

export function newCapsuleLayer(): Layer {
  layerCounter++
  const w = 160, h = 60
  return {
    id:        `capsule_${layerCounter}`,
    name:      `Capsule ${layerCounter}`,
    type:       'shape',
    shapeKind:  'capsule',
    shapeParams:{ kind: 'capsule' },
    transform: { ...DEFAULT_TRANSFORM,
                 x: 60 + (layerCounter % 5) * 20, y: 60 + (layerCounter % 5) * 20,
                 anchorX: w / 2, anchorY: h / 2 },
    opacity: 1,
    style:   { fill: { type: 'solid', color: '#EC4899' } },
    size:    { width: w, height: h },
  }
}

// ── BL-24: Spiral / Wave / Blob factories ────────────────────────────────────
//
// Spiral & Wave default to STROKE only (open paths — fill would be meaningless).
// Blob defaults to FILL (closed organic shape).

export function newSpiralLayer(): Layer {
  layerCounter++
  const w = 120, h = 120
  return {
    id:        `spiral_${layerCounter}`,
    name:      `Spiral ${layerCounter}`,
    type:       'shape',
    shapeKind:  'spiral',
    shapeParams:{ kind: 'spiral', turns: 3, startRadius: 4, endRadius: 56, tightness: 1 },
    transform: { ...DEFAULT_TRANSFORM,
                 x: 60 + (layerCounter % 5) * 20, y: 60 + (layerCounter % 5) * 20,
                 anchorX: w / 2, anchorY: h / 2 },
    opacity: 1,
    style:   { stroke: { color: '#8B5CF6', width: 2, lineCap: 'round', lineJoin: 'round' } },
    size:    { width: w, height: h },
  }
}

export function newWaveLayer(): Layer {
  layerCounter++
  const w = 200, h = 80
  return {
    id:        `wave_${layerCounter}`,
    name:      `Wave ${layerCounter}`,
    type:       'shape',
    shapeKind:  'wave',
    shapeParams:{ kind: 'wave', amplitude: 20, frequency: 2, phase: 0 },
    transform: { ...DEFAULT_TRANSFORM,
                 x: 60 + (layerCounter % 5) * 20, y: 60 + (layerCounter % 5) * 20,
                 anchorX: w / 2, anchorY: h / 2 },
    opacity: 1,
    style:   { stroke: { color: '#06B6D4', width: 2, lineCap: 'round', lineJoin: 'round' } },
    size:    { width: w, height: h },
  }
}

export function newBlobLayer(): Layer {
  layerCounter++
  const w = 120, h = 120
  return {
    id:        `blob_${layerCounter}`,
    name:      `Blob ${layerCounter}`,
    type:       'shape',
    shapeKind:  'blob',
    shapeParams:{ kind: 'blob', sides: 8, irregularity: 0.4, seed: 42 },
    transform: { ...DEFAULT_TRANSFORM,
                 x: 60 + (layerCounter % 5) * 20, y: 60 + (layerCounter % 5) * 20,
                 anchorX: w / 2, anchorY: h / 2 },
    opacity: 1,
    style:   { fill: { type: 'solid', color: '#10B981' } },
    size:    { width: w, height: h },
  }
}

export function newBezierPathLayer(): Layer {
  layerCounter++
  // Empty anchors — Pen Tool draws on first canvas click. See BL-66.
  return {
    id:    `path_${layerCounter}`,
    name:  `Path ${layerCounter}`,
    type:  'path',
    pathRole: 'visual',
    transform: { ...DEFAULT_TRANSFORM, x: 0, y: 0 },
    opacity: 1,
    style: { stroke: { color: '#60A5FA', width: 3, lineCap: 'round', lineJoin: 'round' } },
    path: { closed: false, anchors: [] },
  }
}

export function newMotionPathLayer(): Layer {
  layerCounter++
  // Motion guide path — drawn by the user, then assigned to other layers via
  // followPath. Not rendered as a visible stroke during playback.
  return {
    id:    `mpath_${layerCounter}`,
    name:  `Motion Path ${layerCounter}`,
    type:  'path',
    pathRole: 'motion',
    transform: { ...DEFAULT_TRANSFORM, x: 0, y: 0 },
    opacity: 1,
    style: {
      stroke: { color: '#F59E0B', width: 2, lineCap: 'round', lineJoin: 'round',
                dashArray: [6, 4] },
    },
    path: { closed: false, anchors: [] },
  }
}

export function newRoundedRectLayer(): Layer {
  const l = newRectLayer()
  l.id   = l.id.replace(/^rect_/, 'rrect_')
  l.name = l.name.replace(/^Rect /, 'Rounded ')
  l.style = { ...(l.style ?? {}), cornerRadius: 24 }
  return l
}

// ── Text layer ────────────────────────────────────────────────────────────────

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
    layerIds: [],
  }
}

export const DEFAULT_COMPOSITION: Composition = {
  id: 'scene',
  width: 360,
  height: 240,
  durationMs: 1200,
  frameRate: 60,
  // White matches Figma / Jitter / SVGator defaults — feels like a fresh
  // canvas, contrasts well with most layer fills, and pairs naturally
  // with the grid stroke colours.
  backgroundColor: '#FFFFFF',
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

/** Marker (BL-11) — Ctrl+Click on the ruler creates one. Default color
 *  cycles through a small palette so consecutive markers stay distinct
 *  without making the user pick. */
const MARKER_COLORS = ['#a78bfa', '#fbbf24', '#34d399', '#f87171', '#22d3ee', '#fb7185']
export function newMarker(timeMs: number, label?: string): TimelineMarker {
  markerCounter++
  return {
    id:    `marker_${markerCounter}`,
    timeMs,
    label: label ?? `Marker ${markerCounter}`,
    color: MARKER_COLORS[(markerCounter - 1) % MARKER_COLORS.length],
  }
}

/** Empty ParameterWire (BL-05) — defaults to identity passthrough.
 *  User picks source/target via the picker, then writes the expression.
 *  Either ref can be pre-filled (e.g. PropertiesPanel 🔗 click sets target). */
export function newParameterWire(
  overrides?: Partial<ParameterWire>,
): ParameterWire {
  wireCounter++
  const now = Date.now()
  return {
    id: `wire_${wireCounter}`,
    enabled: true,
    source: { propertyPath: '', valueType: 'number' },
    target: { propertyPath: '', valueType: 'number' },
    expression: 'source',
    blendMode: 'override',
    createdAt: now,
    updatedAt: now,
    ...overrides,
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

// ── Particle Emitter factory (BL-13) ─────────────────────────────────────────

export function newParticleEmitterLayer(): Layer {
  layerCounter++
  // Inline the magicDust default config to avoid circular import with
  // the preset registry (which imports defaults.ts indirectly).
  // The full preset is loaded by bootstrap; here we just embed defaults.
  return {
    id:   `particleEmitter_${layerCounter}`,
    name: `Particles ${layerCounter}`,
    type: 'particleEmitter',
    transform: {
      x: 90 + (layerCounter % 5) * 20,
      y: 90 + (layerCounter % 5) * 20,
      scaleX: 1, scaleY: 1,
      rotationDeg: 0,
      anchorX: 0, anchorY: 0,
    },
    opacity: 1,
    // size: 0×0 — the renderer draws particles in layer-local space; the
    // size field is only used for hit-testing fallback (24×24 bounding box
    // assigned by CanvasRenderer when size is missing or zero).
    size: { width: 0, height: 0 },
    particleEmitter: {
      mode: 'simple',
      emitter: {
        // Burst mode: particles are visible at t=0 (no warm-up needed).
        // Continuous mode requires time > 0 before any particles appear —
        // bad for a first impression in the editor.
        mode:         'burst',
        shape:        'point',
        burstCount:   60,
        maxParticles: 60,
        durationMs:   2000,
        loop:         false,
      },
      particle: {
        shape:     'rect',
        size:      { min: 5, max: 12 },
        // Palette mode: vivid confetti colours work on both light and dark
        // backgrounds. Avoid 'screen' blend for the default — screen(X, white)
        // = white, making all particles invisible on a white canvas.
        colorMode: 'palette',
        palette: [
          { r: 239, g: 68,  b: 68,  a: 255 },  // red
          { r: 234, g: 179, b: 8,   a: 255 },  // yellow
          { r: 34,  g: 197, b: 94,  a: 255 },  // green
          { r: 59,  g: 130, b: 246, a: 255 },  // blue
          { r: 168, g: 85,  b: 247, a: 255 },  // purple
          { r: 236, g: 72,  b: 153, a: 255 },  // pink
        ],
      },
      animation: {
        lifetimeMs: { min: 700, max: 1400 },
        positionOffset: {
          x: { min: -80, max: 80 },
          y: { min: -120, max: -20 },
          easing: 'easeOut',
        },
        scaleOverLife: {
          stops: [
            { t: 0,   value: 0.5 },
            { t: 0.2, value: 1,   easing: 'easeOut' },
            { t: 1,   value: 0.3, easing: 'easeIn'  },
          ],
        },
        opacityOverLife: {
          stops: [
            { t: 0,   value: 1   },
            { t: 0.7, value: 1   },
            { t: 1,   value: 0,  easing: 'easeIn' },
          ],
        },
        rotationVelocity: { min: -360, max: 360 },
      },
      random: {
        seed:               42,
        positionRandomness: 0.6,
        sizeRandomness:     0.5,
        rotationRandomness: 1,
        delayRandomness:    0.3,
        lifetimeRandomness: 0.4,
        colorRandomness:    0,
      },
      rendering: {
        blendMode: 'normal',
        softEdges: false,
        quality:   'medium',
      },
    },
  }
}

// ── Keyframe factory ──────────────────────────────────────────────────────────

export { nextKfId }
