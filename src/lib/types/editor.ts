// ── Editor-only Types ─────────────────────────────────────────────────────────
// These types exist only in the builder; they are stripped on runtime export.

import type { LayerType } from './core'

// ── Animatable Property Descriptor ────────────────────────────────────────────

export type AnimatableGroup = 'Transform' | 'Fill' | 'Stroke' | 'Text' | 'Effects' | 'Path' | 'Geometry' | 'Trim Path'

export interface AnimatableProperty {
  label: string
  /** Dot-separated property path relative to Layer, e.g. 'transform.x' */
  path: string
  group: AnimatableGroup
  /** If set, property only appears for these layer types. undefined = all types. */
  layerTypes?: LayerType[]
}

export const ANIMATABLE_PROPERTIES: AnimatableProperty[] = [
  // ── Transform ─────────────────────────────────────────────────────────────
  { label: 'Opacity',         path: 'opacity',               group: 'Transform' },
  { label: 'X',               path: 'transform.x',           group: 'Transform' },
  { label: 'Y',               path: 'transform.y',           group: 'Transform' },
  { label: 'Scale X',         path: 'transform.scaleX',      group: 'Transform' },
  { label: 'Scale Y',         path: 'transform.scaleY',      group: 'Transform' },
  { label: 'Rotation',        path: 'transform.rotationDeg', group: 'Transform' },
  // ── Shape Fill ────────────────────────────────────────────────────────────
  { label: 'Fill Color',      path: 'style.fill.color',      group: 'Fill',   layerTypes: ['shape'] },
  { label: 'Fill Opacity',    path: 'style.fill.opacity',    group: 'Fill',   layerTypes: ['shape'] },
  // ── Shape Stroke ──────────────────────────────────────────────────────────
  { label: 'Stroke Width',    path: 'style.stroke.width',    group: 'Stroke', layerTypes: ['shape'] },
  { label: 'Stroke Opacity',  path: 'style.stroke.opacity',  group: 'Stroke', layerTypes: ['shape'] },
  { label: 'Corner Radius',   path: 'style.cornerRadius',    group: 'Stroke', layerTypes: ['shape'] },
  // ── Text ──────────────────────────────────────────────────────────────────
  { label: 'Font Size',       path: 'text.fontSize',         group: 'Text',   layerTypes: ['text'] },
  { label: 'Letter Spacing',  path: 'text.letterSpacing',    group: 'Text',   layerTypes: ['text'] },
  // ── Effects ───────────────────────────────────────────────────────────────
  { label: 'Blur',            path: 'effects.blur',          group: 'Effects' },
  { label: 'Brightness',      path: 'effects.brightness',    group: 'Effects' },
  { label: 'Contrast',        path: 'effects.contrast',      group: 'Effects' },
  { label: 'Saturate',        path: 'effects.saturate',      group: 'Effects' },
  // ── Motion Path ───────────────────────────────────────────────────────────
  { label: 'Path Offset',     path: 'motionPath.offset',     group: 'Path' },
  // ── Follow Path (binds layer position to another path layer) ──────────────
  { label: 'Follow Progress',         path: 'followPath.progress',            group: 'Path' },
  { label: 'Follow Rotation Offset',  path: 'followPath.rotationOffset',      group: 'Path' },
  { label: 'Follow Perp Offset',      path: 'followPath.perpendicularOffset', group: 'Path' },
  // ── Path Stroke Layer ─────────────────────────────────────────────────────
  { label: 'Trim Offset',     path: 'pathStroke.trim.offset',         group: 'Path', layerTypes: ['pathStroke'] },
  { label: 'Trim Length',     path: 'pathStroke.trim.segmentLength',  group: 'Path', layerTypes: ['pathStroke'] },
  { label: 'Stroke Width',    path: 'pathStroke.stroke.width',        group: 'Stroke', layerTypes: ['pathStroke'] },
  { label: 'Stroke Color',    path: 'pathStroke.stroke.color',        group: 'Stroke', layerTypes: ['pathStroke'] },
  // ── Shape Geometry (shape-specific params) ────────────────────────────────
  { label: 'Sides',           path: 'shapeParams.sides',        group: 'Geometry',  layerTypes: ['shape'] },
  { label: 'Inner Radius',    path: 'shapeParams.innerRadius',  group: 'Geometry',  layerTypes: ['shape'] },
  { label: 'Outer Radius',    path: 'shapeParams.outerRadius',  group: 'Geometry',  layerTypes: ['shape'] },
  { label: 'Roundness',       path: 'shapeParams.roundness',    group: 'Geometry',  layerTypes: ['shape'] },
  { label: 'Start Angle',     path: 'shapeParams.startAngle',   group: 'Geometry',  layerTypes: ['shape'] },
  { label: 'End Angle',       path: 'shapeParams.endAngle',     group: 'Geometry',  layerTypes: ['shape'] },
  // ── Shape Trim Path (animates stroke reveal / progress) ───────────────────
  { label: 'Trim Start',      path: 'style.stroke.trim.start',  group: 'Trim Path', layerTypes: ['shape'] },
  { label: 'Trim End',        path: 'style.stroke.trim.end',    group: 'Trim Path', layerTypes: ['shape'] },
  { label: 'Trim Offset',     path: 'style.stroke.trim.offset', group: 'Trim Path', layerTypes: ['shape'] },
]

// ── Timeline Settings ─────────────────────────────────────────────────────────

export type TimelineMode = 'dope' | 'curve' | 'segments'

/** Auto-keyframe / record mode (BL-41).
 *  - `manual`  → property edits never write keyframes. User adds keys via 'K'
 *                or the diamond button. Default.
 *  - `auto`    → every property edit upserts a keyframe at the current time.
 *                Equivalent to the legacy `autoKeyframe = true` flag.
 *  - `record`  → same write behaviour as `auto`, but visually emphasised
 *                (red ● badge, red playhead) so the user knows changes are
 *                being committed to the timeline. Intended for live tweaking
 *                during playback. */
export type AutoKeyMode = 'manual' | 'auto' | 'record'

export interface TimelineSettings {
  autoKeyframe: boolean
  /** Auto-key behaviour selector — supersedes `autoKeyframe` but the boolean
   *  is still derived for backward compat with existing consumers. */
  autoKeyMode?: AutoKeyMode
  snapEnabled: boolean
  snapToFrame: boolean
  snapToGrid: boolean
  snapToKeyframes: boolean
  snapToMarkers: boolean
  timelineMode: TimelineMode
  showGraphEditor: boolean
  /** Playback speed multiplier: 0.25 | 0.5 | 1 | 2 */
  playbackSpeed: number
}

// ── Timeline Ghost/Onion Skin Settings ────────────────────────────────────────

/** Ghost frame rendering settings for timeline playhead-relative visualization.
 *  This is transient UI state, not persisted. */
export interface TimelineGhostSettings {
  /** Enable ghost frame visualization */
  enabled: boolean
  /** Show ghost frames for 'all' animated layers or 'selected' layers only */
  scope: 'all' | 'selected'
  /** Number of frames before playhead to show */
  beforeFrames: number
  /** Number of frames after playhead to show */
  afterFrames: number
  /** Opacity of ghost frames (0–100, typically 20–50) */
  opacity: number
  /** Frame rate for ghost interpolation (default 30 fps) */
  fps?: number
}

export const DEFAULT_TIMELINE_GHOST_SETTINGS: TimelineGhostSettings = {
  enabled: false,
  scope: 'selected',
  beforeFrames: 5,
  afterFrames: 5,
  opacity: 30,
  fps: 30,
}

export const DEFAULT_TIMELINE_SETTINGS: TimelineSettings = {
  autoKeyframe: false,
  autoKeyMode: 'manual',
  snapEnabled: true,
  snapToFrame: true,
  snapToGrid: false,
  snapToKeyframes: true,
  snapToMarkers: true,
  timelineMode: 'dope',
  showGraphEditor: false,
  playbackSpeed: 1,
}

// ── Editor Selection ──────────────────────────────────────────────────────────

export interface EditorSelection {
  selectedLayerIds: string[]
  /** UUID-based — survives keyframe timeMs changes during drag */
  selectedKeyframeIds: string[]
}

// ── Composition Presets ───────────────────────────────────────────────────────

export interface CompositionPreset {
  id: string
  name: string
  width: number
  height: number
}

export const COMPOSITION_PRESETS: CompositionPreset[] = [
  { id: 'square',       name: 'Square Social (1080×1080)',          width: 1080, height: 1080 },
  { id: 'story',        name: 'Story / Reels / TikTok (1080×1920)', width: 1080, height: 1920 },
  { id: 'youtube',      name: 'YouTube Full HD (1920×1080)',         width: 1920, height: 1080 },
  { id: 'hd',           name: 'HD (1280×720)',                       width: 1280, height: 720  },
  { id: 'mobilebanner', name: 'Mobile Banner (1080×400)',            width: 1080, height: 400  },
  { id: 'webhero',      name: 'Web Hero (1920×800)',                 width: 1920, height: 800  },
  { id: 'appsplash',    name: 'App Splash (1080×2400)',              width: 1080, height: 2400 },
  { id: 'custom',       name: 'Custom',                             width: 0,    height: 0    },
]
