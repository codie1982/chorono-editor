// ── Keyframe Actions ──────────────────────────────────────────────────────────
// Batch keyframe creation with auto-create timeline + auto-create track.
//
// Critical: upsertKeyframe (timeline/keyframeOps.ts) only maps over EXISTING
// tracks. We must ensureTimeline + ensureTrack first or keyframes silently
// disappear.

import { errorCmd } from './_shared'
import type {
  ChronoScene, Keyframe, Track, Timeline,
  AnimatableValue, EasingType,
} from '@/lib/types'
import { upsertKeyframe, ensureLayerInTimeline } from '@/lib/timeline/keyframeOps'
import type { ActionRegistry } from '../ActionRegistry'
import { assertTrackValues, isColorTarget, isColorValue, isVec2 } from '@/lib/animation/typedValues'
import { keyframeInputSchema, simpleEasingSchema, SIMPLE_EASING_TYPES } from '@/lib/animation/typedValueSchema'
import { readScriptPath } from '@/lib/script/api/scriptData'

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

const VALID_EASINGS: ReadonlySet<EasingType> = new Set<EasingType>(SIMPLE_EASING_TYPES)

function coerceEasing(raw: unknown): EasingType {
  if (typeof raw === 'string' && (VALID_EASINGS as Set<string>).has(raw)) {
    return raw as EasingType
  }
  return 'easeInOut'
}

/**
 * Coerce arbitrary JSON value into AnimatableValue.
 * - Color targets retain CSS, canonical RGBA and legacy packed RGB values.
 * - Vec2 and booleans pass through; ordinary text values remain discrete.
 * - Numeric strings keep legacy numeric coercion except for typed text fields.
 *
 * Throws on non-coercible values — caller surfaces as error command.
 */
function coerceValue(target: string, raw: unknown, staticValue: unknown): AnimatableValue {
  if (isColorTarget(target) && (typeof raw === 'string' || typeof raw === 'number' || isColorValue(raw))) return raw
  if (isColorValue(raw) || isVec2(raw)) return raw
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'string' && (typeof staticValue === 'string' || /\.text\.value$/.test(target))) return raw
  const n = Number(raw)
  if (Number.isFinite(n)) return n
  if (typeof raw === 'string') return raw
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

/** Register the legacy auto-creating key action with a typed input schema.
 * Its numeric-string coercion, easeInOut insertion default, exact-time update and
 * single undo command remain compatible; color/text/vector families follow the
 * same validation/evaluation helpers as modern scene commits. */
export function registerKeyframeActions(reg: ActionRegistry): void {
  reg.register<AddKeyframesParams>({
    id: 'keyframe.addBatch',
    toolName: 'add_keyframes',
    description:
`Upsert keys on a target path using the legacy auto-create timeline/track workflow; creates one undoable editor command. Use an explicit existing timeline when preserving its settings. Exact-time updates preserve key IDs, tangents and unspecified easing; nearby fractional keys remain separate. New keys retain the legacy easeInOut default.

TRACK TARGET FORMAT: "layers.{layerId}.{property}"

AVAILABLE PROPERTIES:
  opacity                → 0.0 - 1.0
  transform.x            → pixels (horizontal position)
  transform.y            → pixels (vertical position)
  transform.scaleX       → 1.0 = 100%
  transform.scaleY       → 1.0 = 100%
  transform.rotationDeg  → degrees
  style.fill.color       → CSS hex/rgb/hsl, supported color name, RGBA 0..255 or packed RGB; channels interpolate
  style.fill.opacity     → 0.0 - 1.0
  style.stroke.width     → pixels
  style.cornerRadius     → pixels
  text.fontSize          → pixels
  text.letterSpacing     → pixels
  effects.<effectId>.*    → use the actual registered effect property schema

Numbers and Vec2 interpolate; strings and booleans hold until the next key. Match the source property's data type. One key is valid for a held value. Time is timeline-local milliseconds, transform coordinates are parent-local pixels and rotation is degrees. Omitted easing is easeInOut; it belongs to the leading key.

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
          minItems: 1,
          description: 'One or more keys. One key holds a value; at least two distinct times are needed for interpolation.',
          items: keyframeInputSchema(simpleEasingSchema),
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
      const layerId = layerMatch?.[1], layer = scene.layers.find(l => l.id === layerId)
      if (layerId && !layer) {
        return errorCmd(`layer "${layerId}" not found for target "${p.target}"`)
      }

      // Build keyframes with coerced values + easings
      let kfs: Keyframe[]
      try {
        const staticValue = layer ? readScriptPath(layer, p.target.slice(`layers.${layerId}.`.length)) : undefined
        kfs = p.keyframes.map((kf, i) => ({
          id:     `kf_ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${i}`,
          timeMs: Number(kf.timeMs) || 0,
          value:  coerceValue(p.target, kf.value, staticValue),
          easing: { type: coerceEasing(kf.easing) },
        }))
        const existing = scene.timelines.find(timeline => timeline.id === p.timelineId)?.tracks.find(track => track.target === p.target)
        assertTrackValues({ ...existing, target: p.target, keyframes: kfs }, staticValue ?? undefined)
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
          if (layerId) next = ensureLayerInTimeline(next, p.timelineId, layerId)
          for (const [index, kf] of Array.from(kfs.entries())) {
            next = upsertKeyframe(next, p.timelineId, p.target, kf, { updateEasing: p.keyframes[index].easing !== undefined })
          }
          return next
        },
        undo: () => snapshot,
      }
    },
  })
}

