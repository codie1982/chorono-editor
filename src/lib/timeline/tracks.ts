// ── Track Type Architecture (BL-35) ────────────────────────────────────────
//
// Foundation for multi-kind tracks on the Timeline. Today only
// `PropertyTrack` exists (keyframe-driven property animation), but the doc
// envisions Event / Audio / Marker / State / Trigger tracks living side by
// side in the same Timeline.tracks[] array, all sharing a common base shape.
//
// Strategy: keep the legacy `Track` interface in `types/core.ts` working
// (existing creators / readers don't have to change). NEW track-kind types
// are defined here as a discriminated union via `kind`. The legacy `Track`
// is structurally a `PropertyTrack` minus the `kind` discriminator — code
// that needs to be polymorphic should consume `AnyTrack` and use the type
// guards below. Code that's property-only can keep reading `Track`.

import type { Keyframe, Track as LegacyTrack, TimelineMarker } from '../types/core'

// ── Common base ─────────────────────────────────────────────────────────────

export type TrackKind =
  | 'property'      // keyframed animation of a layer property (current default)
  | 'event'         // discrete callable markers fired at a time (BL-36)
  | 'audio'         // a clip with waveform + gain envelope (BL-37)
  | 'marker'        // typed notes / scene boundaries
  | 'state'         // state-machine regions (idle / hover / pressed)
  | 'trigger'       // input regions (hover / click / scroll / drag)

export interface TrackBase {
  /** Stable, human-friendly id (often the same string used as `target`). */
  id?:        string
  /** Display label. Falls back to id / target. */
  label?:     string
  /** Discriminator for the union below. */
  kind:       TrackKind
  /** Optional hex color label inherited from a parent (e.g. layer.colorLabel). */
  color?:     string
  /** UI-only: hidden from the curve editor / dope sheet view. */
  hidden?:    boolean
  /** UI-only: lock the track from editing. */
  locked?:    boolean
}

// ── Property track (existing behaviour) ─────────────────────────────────────
//
// Same shape as `Track` from core.ts but adds the `kind: 'property'`
// discriminator. We do NOT replace the legacy type — callers that create
// tracks without a `kind` field are interpreted as PropertyTrack via the
// `asPropertyTrack` adapter below.

export interface PropertyTrack extends TrackBase {
  kind:       'property'
  /** Dotted target path, e.g. "layers.card.opacity". */
  target:     string
  keyframes:  Keyframe[]
}

// ── Forthcoming track kinds (stubs for BL-36 / BL-37 / etc.) ───────────────

/** Timeline-level event marker — fires a runtime action when the playhead
 *  crosses its time. Used by BL-36 Event Track. */
export interface TimelineEvent {
  id:       string
  timeMs:   number
  /** Human-readable label shown on the marker. */
  name:     string
  /** Optional payload — wired to the action registry at runtime. */
  payload?: Record<string, unknown>
}
export interface EventTrack extends TrackBase {
  kind:   'event'
  events: TimelineEvent[]
}

/** A clip referencing an asset, with a gain envelope. Used by BL-37
 *  Audio Track. */
export interface AudioTrack extends TrackBase {
  kind:    'audio'
  assetId: string
  /** Where in the timeline the clip starts (ms). */
  startMs: number
  /** Clip duration (ms). 0 / undefined = full asset. */
  durationMs?: number
  /** Constant gain 0..1 — automation comes via a separate PropertyTrack. */
  gain?: number
}

/** Wraps the existing `TimelineMarker` list as a first-class track so
 *  markers can be filtered / soloed alongside other track kinds. */
export interface MarkerTrack extends TrackBase {
  kind:    'marker'
  markers: TimelineMarker[]
}

/** A region of the timeline that represents a state. Used by BL-09 / BL-39
 *  state machine integration. */
export interface StateRegion {
  id:       string
  startMs:  number
  endMs:    number
  name:     string
  color?:   string
}
export interface StateTrack extends TrackBase {
  kind:   'state'
  states: StateRegion[]
}

/** A trigger region — an interactive zone bound to an input (hover, click,
 *  scroll, drag, …). */
export interface TriggerRegion {
  id:      string
  startMs: number
  endMs:   number
  /** What kind of input fires this trigger. */
  input:   'hover' | 'click' | 'scroll' | 'drag' | 'custom'
  /** Custom input name when input === 'custom'. */
  customName?: string
}
export interface TriggerTrack extends TrackBase {
  kind:     'trigger'
  triggers: TriggerRegion[]
}

// ── Discriminated union ─────────────────────────────────────────────────────

export type AnyTrack =
  | PropertyTrack
  | EventTrack
  | AudioTrack
  | MarkerTrack
  | StateTrack
  | TriggerTrack

// ── Type guards ─────────────────────────────────────────────────────────────

export function isPropertyTrack(t: AnyTrack | LegacyTrack): t is PropertyTrack {
  // Legacy tracks (no `kind` field) ARE property tracks by definition.
  const k = (t as { kind?: TrackKind }).kind
  return k === undefined || k === 'property'
}
export function isEventTrack    (t: AnyTrack): t is EventTrack    { return t.kind === 'event'    }
export function isAudioTrack    (t: AnyTrack): t is AudioTrack    { return t.kind === 'audio'    }
export function isMarkerTrack   (t: AnyTrack): t is MarkerTrack   { return t.kind === 'marker'   }
export function isStateTrack    (t: AnyTrack): t is StateTrack    { return t.kind === 'state'    }
export function isTriggerTrack  (t: AnyTrack): t is TriggerTrack  { return t.kind === 'trigger'  }

// ── Adapters ────────────────────────────────────────────────────────────────

/** Coerce a legacy `Track` (no kind) to `PropertyTrack`. Existing scene
 *  data uses the legacy shape; this normalises on read without forcing
 *  a migration of every persisted scene. */
export function asPropertyTrack(t: LegacyTrack | PropertyTrack): PropertyTrack {
  if ((t as PropertyTrack).kind === 'property') return t as PropertyTrack
  return { kind: 'property', target: t.target, label: t.label, keyframes: t.keyframes }
}

/** Extract only the property tracks from a heterogeneous array. Useful
 *  when iterating Timeline.tracks for property-only work (most of the
 *  current codebase). Legacy tracks (no `kind` field) ARE returned. */
export function propertyTracksOf<T extends LegacyTrack | AnyTrack>(arr: T[]): PropertyTrack[] {
  const out: PropertyTrack[] = []
  for (const t of arr) {
    if (isPropertyTrack(t as AnyTrack | LegacyTrack)) out.push(asPropertyTrack(t as LegacyTrack | PropertyTrack))
  }
  return out
}
