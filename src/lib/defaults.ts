import type { Layer, Timeline, Composition, ChronoScene, Transform } from './types'

let layerCounter    = 0
let timelineCounter = 0
let kfCounter       = 0

/** Generate a lightweight unique ID for keyframes (no crypto dependency). */
function nextKfId(): string {
  return `kf_${Date.now()}_${++kfCounter}`
}

export const DEFAULT_TRANSFORM: Transform = {
  x: 40, y: 40, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0,
}

export function newRectLayer(): Layer {
  layerCounter++
  return {
    id:   `rect_${layerCounter}`,
    name: `Rect ${layerCounter}`,
    type:  'shape',
    shape: 'rect',
    transform: {
      ...DEFAULT_TRANSFORM,
      x: 40 + (layerCounter % 5) * 20,
      y: 40 + (layerCounter % 5) * 20,
    },
    opacity: 1,
    style: {
      fill: { type: 'solid', color: '#3B82F6' },
      cornerRadius: 8,
    },
    size: { width: 160, height: 80 },
  }
}

export function newCircleLayer(): Layer {
  layerCounter++
  return {
    id:   `circle_${layerCounter}`,
    name: `Circle ${layerCounter}`,
    type:  'shape',
    shape: 'circle',
    transform: {
      ...DEFAULT_TRANSFORM,
      x: 60 + (layerCounter % 5) * 20,
      y: 60 + (layerCounter % 5) * 20,
    },
    opacity: 1,
    style: {
      fill: { type: 'solid', color: '#EF4444' },
    },
    size: { width: 60, height: 60 },
  }
}

export function newImageLayer(assetId: string, w = 200, h = 150): Layer {
  layerCounter++
  return {
    id:   `image_${layerCounter}`,
    name: `Image ${layerCounter}`,
    type: 'image',
    transform: { ...DEFAULT_TRANSFORM, x: 40, y: 40 },
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
    transform: { ...DEFAULT_TRANSFORM, x: 40, y: 40 },
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
  return {
    id:   `text_${layerCounter}`,
    name: `Text ${layerCounter}`,
    type: 'text',
    transform: {
      ...DEFAULT_TRANSFORM,
      x: 50,
      y: 100 + (layerCounter % 5) * 20,
    },
    opacity: 1,
    text: { value: 'Chorono', fontSize: 24, color: '#FFFFFF' },
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
    initialState: {},
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
