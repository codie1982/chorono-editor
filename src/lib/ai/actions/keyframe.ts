// ── Keyframe Actions ──────────────────────────────────────────────────────────
// Batch keyframe creation with auto-create timeline + auto-create track.
//
// Critical: upsertKeyframe (timeline/keyframeOps.ts) only maps over EXISTING
// tracks. We must ensureTimeline + ensureTrack first or keyframes silently
// disappear.

import type {
  ChronoScene, Keyframe, Track, Timeline,
  AnimatableValue, EasingType,
} from '@/lib/types'
import { upsertKeyframe } from '@/lib/timeline/keyframeOps'
import type { ActionRegistry } from '../ActionRegistry'

interface KfInput {
  timeMs: number
  value: unknown
  easing?: string
}

interface AddKeyframesParams {
  timelineId: string
  target: string
  keyframes: KfInput[]
}

// ── Coercion helpers ──────────────────────────────────────────────────────────

const VALID_EASINGS: ReadonlySet<EasingType> = new Set<EasingType>([
  'linear', 'hold', 'easeIn', 'easeOut', 'easeInOut',
])

function coerceEasing(raw: unknown): EasingType {
  if (typeof raw === 'string' && (VALID_EASINGS as Set<string>).has(raw)) {
    return raw as EasingType
  }
  return 'easeInOut'
}

/**
 * Coerce arbitrary JSON value into AnimatableValue.
 * - Color tracks (.color suffix): kept as hex string. Renderer reads override
 *   directly; AI must use 2-keyframe step transitions (no smooth interp).
 * - Vec2 objects: pass through
 * - Booleans: pass through
 * - Default: numeric coercion
 *
 * Throws on non-coercible values — caller surfaces as error command.
 */
function coerceValue(target: string, raw: unknown): AnimatableValue {
  if (target.endsWith('.color') || target.toLowerCase().endsWith('color')) {
    return String(raw)
  }
  if (typeof raw === 'object' && raw !== null && 'x' in raw && 'y' in raw) {
    return raw as AnimatableValue
  }
  if (typeof raw === 'boolean') return raw
  const n = Number(raw)
  if (Number.isFinite(n)) return n
  throw new Error(`cannot coerce value "${String(raw)}" for target "${target}"`)
}

// ── Scene mutation helpers ────────────────────────────────────────────────────

/** Ensure scene contains the named timeline; create one if missing. */
function ensureTimeline(
  scene: ChronoScene,
  timelineId: string,
  fallbackDurationMs: number,
): ChronoScene {
  if (scene.timelines.some((t) => t.id === timelineId)) return scene
  const tl: Timeline = {
    id:         timelineId,
    durationMs: Math.max(fallbackDurationMs, 1000),
    autoplay:   true,
    loop:       false,
    tracks:     [],
  }
  return { ...scene, timelines: [...scene.timelines, tl] }
}

/** Ensure the timeline contains an empty track with the given target. */
function ensureTrack(
  scene: ChronoScene,
  timelineId: string,
  target: string,
): ChronoScene {
  return {
    ...scene,
    timelines: scene.timelines.map((tl) => {
      if (tl.id !== timelineId) return tl
      if (tl.tracks.some((t) => t.target === target)) return tl
      const track: Track = { target, keyframes: [] }
      return { ...tl, tracks: [...tl.tracks, track] }
    }),
  }
}

// ── Registration ──────────────────────────────────────────────────────────────

export function registerKeyframeActions(reg: ActionRegistry): void {
  reg.register<AddKeyframesParams>({
    id: 'keyframe.addBatch',
    toolName: 'add_keyframes',
    description:
`Add keyframes to animate a layer property. Auto-creates timeline + track if missing.

TRACK TARGET FORMAT: "layers.{layerId}.{property}"

AVAILABLE PROPERTIES:
  opacity                → 0.0 - 1.0
  transform.x            → pixels (horizontal position)
  transform.y            → pixels (vertical position)
  transform.scaleX       → 1.0 = 100%
  transform.scaleY       → 1.0 = 100%
  transform.rotationDeg  → degrees
  style.fill.color       → "#rrggbb" hex string (SNAP — does NOT interpolate)
  style.fill.opacity     → 0.0 - 1.0
  style.stroke.width     → pixels
  style.cornerRadius     → pixels
  text.fontSize          → pixels
  text.letterSpacing     → pixels
  effects.blur           → 0 - 100

EXAMPLES:
  target: "layers.bg_circle.opacity"
  target: "layers.title_text.transform.y"
  target: "layers.logo.transform.scaleX"`,
    parameters: {
      type: 'object',
      required: ['timelineId', 'target', 'keyframes'],
      properties: {
        timelineId: { type: 'string', description: 'ID of the timeline' },
        target:     { type: 'string', description: 'Track target e.g. "layers.bg_circle.opacity"' },
        keyframes: {
          type: 'array',
          description: 'Array of keyframes. Minimum 2 keyframes for animation.',
          items: {
            type: 'object',
            required: ['timeMs', 'value'],
            properties: {
              timeMs: { type: 'number', description: 'Time in milliseconds' },
              value:  { type: 'number', description: 'number for most props, "#rrggbb" hex for colors' },
              easing: {
                type: 'string',
                enum: ['linear', 'easeIn', 'easeOut', 'easeInOut', 'hold'],
                description: 'Easing curve from this keyframe to the next',
              },
            },
          },
        },
      },
    },
    toCommand: (p, scene) => {
      // Validate
      if (!p.timelineId || !p.target || !Array.isArray(p.keyframes) || p.keyframes.length === 0) {
        return errorCmd('add_keyframes missing timelineId / target / keyframes')
      }
      // Validate layerId in target exists (defensive — silent failure otherwise)
      const layerMatch = p.target.match(/^layers\.([^.]+)\./)
      if (layerMatch) {
        const layerId = layerMatch[1]
        if (!scene.layers.some((l) => l.id === layerId)) {
          return errorCmd(`layer "${layerId}" not found for target "${p.target}"`)
        }
      }

      // Build keyframes with coerced values + easings
      let kfs: Keyframe[]
      try {
        kfs = p.keyframes.map((kf, i) => ({
          id:     `kf_ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${i}`,
          timeMs: Number(kf.timeMs) || 0,
          value:  coerceValue(p.target, kf.value),
          easing: { type: coerceEasing(kf.easing) },
        }))
      } catch (err) {
        return errorCmd((err as Error).message)
      }

      const maxTimeMs = Math.max(...kfs.map((k) => k.timeMs), 0)
      const snapshot  = scene

      return {
        label: `AI: Add ${kfs.length} keyframes → ${p.target}`,
        execute: (s) => {
          let next = ensureTimeline(s, p.timelineId, maxTimeMs)
          next     = ensureTrack(next, p.timelineId, p.target)
          for (const kf of kfs) {
            next = upsertKeyframe(next, p.timelineId, p.target, kf)
          }
          return next
        },
        undo: () => snapshot,
      }
    },
  })
}

function errorCmd(message: string) {
  return {
    label: `AI ERROR: ${message}`,
    execute: <S,>(s: S): S => s,
    undo:    <S,>(s: S): S => s,
  }
}
