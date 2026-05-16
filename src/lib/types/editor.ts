// ── Editor-only Types ─────────────────────────────────────────────────────────
// These types exist only in the builder; they are stripped on runtime export.

import type { LayerType } from './core'

// ── Animatable Property Descriptor ────────────────────────────────────────────

export type AnimatableGroup = 'Transform' | 'Fill' | 'Stroke' | 'Text' | 'Effects' | 'Path'

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
]

// ── Timeline Settings ─────────────────────────────────────────────────────────

export interface TimelineSettings {
  autoKeyframe: boolean
  snapEnabled: boolean
  snapToFrame: boolean
  snapToGrid: boolean
  snapToKeyframes: boolean
  snapToMarkers: boolean
  showGraphEditor: boolean
  /** Playback speed multiplier: 0.25 | 0.5 | 1 | 2 */
  playbackSpeed: number
}

export const DEFAULT_TIMELINE_SETTINGS: TimelineSettings = {
  autoKeyframe: false,
  snapEnabled: true,
  snapToFrame: true,
  snapToGrid: false,
  snapToKeyframes: true,
  snapToMarkers: true,
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
