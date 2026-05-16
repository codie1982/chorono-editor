// ── Animation Presets ─────────────────────────────────────────────────────────
// Each preset returns an EditorCommand that adds the necessary tracks +
// keyframes to a specified layer + timeline. Presets are pure factories — no
// React, no DOM, no async work.

import type { ChronoScene, Layer, Keyframe, Track, EasingType } from '../types'
import type { EditorCommand } from '../editor/commands-keyframe'
import { nextKfId } from '../defaults'

export type PresetCategory = 'entrance' | 'exit' | 'emphasis'

export interface AnimationPreset {
  id: string
  name: string
  category: PresetCategory
  /** Default total duration in ms */
  durationMs: number
  description: string
  /** Build the command that mutates the scene */
  apply: (args: ApplyArgs) => EditorCommand
}

export interface ApplyArgs {
  layer: Layer
  timelineId: string
  /** When in the timeline to start the preset (usually the playhead) */
  startMs: number
  /** Optional override of preset.durationMs */
  durationMs?: number
}

// ── Apply helper ─────────────────────────────────────────────────────────────

interface AppliedTrack {
  target: string
  keyframes: Keyframe[]
}

/**
 * Build an "apply preset" command. Merges incoming keyframes into the named
 * timeline, creating missing tracks. Undo restores the timeline's track list
 * via a closure snapshot taken during execute — single-step undo for the
 * entire preset.
 */
function makeSnapshotPresetCmd(
  label: string,
  timelineId: string,
  tracks: AppliedTrack[],
): EditorCommand {
  let previousTimelineTracks: Track[] | null = null

  return {
    label,
    execute(scene: ChronoScene): ChronoScene {
      // Snapshot existing tracks for undo
      const tl = scene.timelines.find((t) => t.id === timelineId)
      if (tl) previousTimelineTracks = tl.tracks

      return {
        ...scene,
        timelines: scene.timelines.map((tl) => {
          if (tl.id !== timelineId) return tl
          let merged: Track[] = [...tl.tracks]
          for (const incoming of tracks) {
            const existing = merged.find((t) => t.target === incoming.target)
            if (existing) {
              const incomingTimes = new Set(incoming.keyframes.map((k) => Math.round(k.timeMs)))
              const filtered = existing.keyframes.filter(
                (k) => !incomingTimes.has(Math.round(k.timeMs)),
              )
              merged = merged.map((t) => t.target === incoming.target
                ? { ...t, keyframes: [...filtered, ...incoming.keyframes].sort((a, b) => a.timeMs - b.timeMs) }
                : t,
              )
            } else {
              merged.push({ target: incoming.target, keyframes: [...incoming.keyframes] })
            }
          }
          return { ...tl, tracks: merged }
        }),
      }
    },
    undo(scene: ChronoScene): ChronoScene {
      if (previousTimelineTracks == null) return scene
      return {
        ...scene,
        timelines: scene.timelines.map((tl) =>
          tl.id !== timelineId ? tl : { ...tl, tracks: previousTimelineTracks! }
        ),
      }
    },
  }
}

// ── Keyframe builder ─────────────────────────────────────────────────────────

function kf(timeMs: number, value: number | boolean | string, easing: EasingType = 'easeOut'): Keyframe {
  return { id: nextKfId(), timeMs, value, easing: { type: easing } }
}

function targetOf(layerId: string, prop: string): string {
  return `layers.${layerId}.${prop}`
}

// ── Built-in presets ─────────────────────────────────────────────────────────

export const ANIMATION_PRESETS: AnimationPreset[] = [
  // ── Entrance ─────────────────────────────────────────────────────────────
  {
    id: 'fade-in', name: 'Fade In', category: 'entrance', durationMs: 500,
    description: 'Opacity 0 → 1',
    apply: ({ layer, timelineId, startMs, durationMs = 500 }) => makeSnapshotPresetCmd(
      'Apply Fade In', timelineId,
      [{ target: targetOf(layer.id, 'opacity'), keyframes: [
        kf(startMs, 0, 'easeOut'),
        kf(startMs + durationMs, 1, 'linear'),
      ]}],
    ),
  },
  {
    id: 'slide-up', name: 'Slide Up', category: 'entrance', durationMs: 500,
    description: 'Enter from below + fade in',
    apply: ({ layer, timelineId, startMs, durationMs = 500 }) => makeSnapshotPresetCmd(
      'Apply Slide Up', timelineId,
      [
        { target: targetOf(layer.id, 'transform.y'), keyframes: [
          kf(startMs, layer.transform.y + 60, 'easeOut'),
          kf(startMs + durationMs, layer.transform.y, 'linear'),
        ]},
        { target: targetOf(layer.id, 'opacity'), keyframes: [
          kf(startMs, 0, 'easeOut'),
          kf(startMs + durationMs, 1, 'linear'),
        ]},
      ],
    ),
  },
  {
    id: 'slide-left', name: 'Slide From Left', category: 'entrance', durationMs: 500,
    description: 'Enter from left + fade in',
    apply: ({ layer, timelineId, startMs, durationMs = 500 }) => makeSnapshotPresetCmd(
      'Apply Slide From Left', timelineId,
      [
        { target: targetOf(layer.id, 'transform.x'), keyframes: [
          kf(startMs, layer.transform.x - 80, 'easeOut'),
          kf(startMs + durationMs, layer.transform.x, 'linear'),
        ]},
        { target: targetOf(layer.id, 'opacity'), keyframes: [
          kf(startMs, 0, 'easeOut'),
          kf(startMs + durationMs, 1, 'linear'),
        ]},
      ],
    ),
  },
  {
    id: 'scale-pop', name: 'Scale Pop', category: 'entrance', durationMs: 400,
    description: 'Scale 0 → 1.1 → 1 + fade in',
    apply: ({ layer, timelineId, startMs, durationMs = 400 }) => makeSnapshotPresetCmd(
      'Apply Scale Pop', timelineId,
      [
        { target: targetOf(layer.id, 'transform.scaleX'), keyframes: [
          kf(startMs, 0, 'easeOut'),
          kf(startMs + durationMs * 0.7, 1.1, 'easeInOut'),
          kf(startMs + durationMs, 1, 'linear'),
        ]},
        { target: targetOf(layer.id, 'transform.scaleY'), keyframes: [
          kf(startMs, 0, 'easeOut'),
          kf(startMs + durationMs * 0.7, 1.1, 'easeInOut'),
          kf(startMs + durationMs, 1, 'linear'),
        ]},
        { target: targetOf(layer.id, 'opacity'), keyframes: [
          kf(startMs, 0, 'easeOut'),
          kf(startMs + durationMs * 0.5, 1, 'linear'),
        ]},
      ],
    ),
  },
  {
    id: 'blur-reveal', name: 'Blur Reveal', category: 'entrance', durationMs: 600,
    description: 'Blur 20px → 0 + fade in',
    apply: ({ layer, timelineId, startMs, durationMs = 600 }) => makeSnapshotPresetCmd(
      'Apply Blur Reveal', timelineId,
      [
        { target: targetOf(layer.id, 'effects.blur'), keyframes: [
          kf(startMs, 20, 'easeOut'),
          kf(startMs + durationMs, 0, 'linear'),
        ]},
        { target: targetOf(layer.id, 'opacity'), keyframes: [
          kf(startMs, 0, 'easeOut'),
          kf(startMs + durationMs, 1, 'linear'),
        ]},
      ],
    ),
  },

  // ── Exit ────────────────────────────────────────────────────────────────
  {
    id: 'fade-out', name: 'Fade Out', category: 'exit', durationMs: 500,
    description: 'Opacity 1 → 0',
    apply: ({ layer, timelineId, startMs, durationMs = 500 }) => makeSnapshotPresetCmd(
      'Apply Fade Out', timelineId,
      [{ target: targetOf(layer.id, 'opacity'), keyframes: [
        kf(startMs, 1, 'easeIn'),
        kf(startMs + durationMs, 0, 'linear'),
      ]}],
    ),
  },

  // ── Emphasis ────────────────────────────────────────────────────────────
  {
    id: 'pulse', name: 'Pulse', category: 'emphasis', durationMs: 600,
    description: 'Scale 1 → 1.05 → 1 (subtle attention)',
    apply: ({ layer, timelineId, startMs, durationMs = 600 }) => makeSnapshotPresetCmd(
      'Apply Pulse', timelineId,
      [
        { target: targetOf(layer.id, 'transform.scaleX'), keyframes: [
          kf(startMs, 1, 'easeInOut'),
          kf(startMs + durationMs / 2, 1.05, 'easeInOut'),
          kf(startMs + durationMs, 1, 'linear'),
        ]},
        { target: targetOf(layer.id, 'transform.scaleY'), keyframes: [
          kf(startMs, 1, 'easeInOut'),
          kf(startMs + durationMs / 2, 1.05, 'easeInOut'),
          kf(startMs + durationMs, 1, 'linear'),
        ]},
      ],
    ),
  },
  {
    id: 'shake', name: 'Shake', category: 'emphasis', durationMs: 400,
    description: 'Horizontal oscillation ±5px',
    apply: ({ layer, timelineId, startMs, durationMs = 400 }) => {
      const baseX = layer.transform.x
      const peaks = 4
      const stepMs = durationMs / (peaks * 2)
      const keyframes: Keyframe[] = [kf(startMs, baseX, 'linear')]
      for (let i = 1; i <= peaks * 2; i++) {
        const sign = i % 2 === 1 ? 1 : -1
        const value = i === peaks * 2 ? baseX : baseX + sign * 5
        keyframes.push(kf(startMs + i * stepMs, value, 'easeInOut'))
      }
      return makeSnapshotPresetCmd(
        'Apply Shake', timelineId,
        [{ target: targetOf(layer.id, 'transform.x'), keyframes }],
      )
    },
  },
]
