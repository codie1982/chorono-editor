import type { ChronoScene, Keyframe, Track, EasingDefinition } from '../types'
import type { EditorCommand } from '../editor/commands-keyframe'
import type { BezierTuple } from '../animation/timeWarp/types'
import { solveBezierParameter } from '../animation/bezierEasing'
import { snapValue, type CurveViewport } from './curveMath'

export interface CurveKeyframeChange {
  target: string
  keyframe: Keyframe
  duplicate?: boolean
}

export function curveDragTimeLimits(times: number[], durationMs: number): { min: number; max: number } | null {
  if (!times.length || !Number.isFinite(durationMs) || durationMs < 0
      || times.some(time => !Number.isFinite(time) || time < 0 || time > durationMs)) return null
  return { min: -Math.min(...times), max: durationMs - Math.max(...times) }
}

export function applyCurveKeyframeChanges(scene: ChronoScene, timelineId: string, changes: CurveKeyframeChange[]): ChronoScene {
  return { ...scene, timelines: scene.timelines.map(timeline => timeline.id !== timelineId ? timeline : {
    ...timeline, tracks: timeline.tracks.map(track => {
      const edits = changes.filter(change => change.target === track.target)
      if (!edits.length) return track
      const replacements = new Map(edits.filter(edit => !edit.duplicate).map(edit => [edit.keyframe.id, edit.keyframe]))
      return { ...track, keyframes: [
        ...track.keyframes.map(key => replacements.get(key.id) ?? key),
        ...edits.filter(edit => edit.duplicate).map(edit => edit.keyframe),
      ].sort((a, b) => a.timeMs - b.timeMs) }
    }),
  }) }
}

/** Both drag axes (and duplication) commit together as one reversible edit. */
export function makeCurveKeyframeChangesCmd(base: ChronoScene, timelineId: string, changes: CurveKeyframeChange[]): EditorCommand {
  const targets = new Set(changes.map(change => change.target))
  const before = base.timelines.find(timeline => timeline.id === timelineId)?.tracks.filter(track => targets.has(track.target)) ?? []
  const after = applyCurveKeyframeChanges(base, timelineId, changes).timelines.find(timeline => timeline.id === timelineId)?.tracks ?? []
  const replace = (scene: ChronoScene, snapshots: Track[]) => ({ ...scene, timelines: scene.timelines.map(timeline => timeline.id !== timelineId ? timeline : {
    ...timeline, tracks: timeline.tracks.map(track => {
      if (!targets.has(track.target)) return track
      const snapshot = snapshots.find(item => item.target === track.target)
      return snapshot ? { ...track, keyframes: snapshot.keyframes } : track
    }),
  }) })
  return { label: changes.some(change => change.duplicate) ? 'Duplicate Curve Keyframes' : 'Edit Curve Keyframes',
    execute: scene => replace(scene, after), undo: scene => replace(scene, before) }
}

/** A colliding drag must not overwrite another key or persist duplicate times. */
export function curveChangesCollide(base: ChronoScene, timelineId: string, changes: CurveKeyframeChange[]): boolean {
  const timeline = base.timelines.find(item => item.id === timelineId)
  if (!timeline) return true
  return changes.some(change => {
    const edits = changes.filter(item => item.target === change.target)
    const movedIds = new Set(edits.filter(item => !item.duplicate).map(item => item.keyframe.id))
    const others = timeline.tracks.find(track => track.target === change.target)?.keyframes.filter(key => !movedIds.has(key.id)) ?? []
    return [...others, ...edits.map(item => item.keyframe)].some(key => key.id !== change.keyframe.id && Math.abs(key.timeMs - change.keyframe.timeMs) <= 1)
  })
}

/** Use the captured track viewport and pointer delta, preserving the grab offset. */
export function curveDragPosition(
  viewport: CurveViewport, target: string, startMs: number, startValue: number,
  dx: number, dy: number, lock: 'x' | 'y' | null, bypassSnap: boolean,
): { ms: number; value: number } {
  const ms = lock === 'y' ? startMs : Math.max(0, startMs + dx / Math.max(1, viewport.widthPx) * (viewport.endMs - viewport.startMs))
  let value = lock === 'x' ? startValue : startValue - dy / Math.max(1, viewport.heightPx) * (viewport.range.max - viewport.range.min)
  if (lock !== 'x' && !bypassSnap) value = snapValue(target, value, viewport).value
  return { ms, value }
}

type InsertionResult = { ok: true; track: Track; insertedIds: string[]; message?: string }
  | { ok: false; reason: string; existingId?: string }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const pointLerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) })

function splitSegment(a: Keyframe, b: Keyframe, ms: number, id: string): { leading: Keyframe; inserted: Keyframe } | null {
  const t = (ms - a.timeMs) / (b.timeMs - a.timeMs)
  const vA = a.value as number, vB = b.value as number
  const type = a.tangentMode === 'linear' ? 'linear' : a.easing?.type ?? 'linear'
  const make = (value: number, easing: EasingDefinition) => ({ id, timeMs: ms, value, easing, tangentMode: 'broken' as const })
  if (type === 'hold') return { leading: a, inserted: make(vA, { type: 'hold' }) }
  if (type === 'linear' || vA === vB) return { leading: { ...a, easing: { type: 'linear' } }, inserted: make(lerp(vA, vB, t), { type: 'linear' }) }
  const bezier: BezierTuple | undefined = type === 'easeIn' ? { cx1: 1 / 3, cy1: 0, cx2: 2 / 3, cy2: 0 }
    : type === 'easeOut' ? { cx1: 1 / 3, cy1: 1, cx2: 2 / 3, cy2: 1 }
    : type === 'customBezier' ? a.easing.bezier : undefined
  if (!bezier) return null
  const u = solveBezierParameter(bezier.cx1, bezier.cx2, t)
  const p0 = { x: 0, y: 0 }, p1 = { x: bezier.cx1, y: bezier.cy1 }, p2 = { x: bezier.cx2, y: bezier.cy2 }, p3 = { x: 1, y: 1 }
  const p01 = pointLerp(p0, p1, u), p12 = pointLerp(p1, p2, u), p23 = pointLerp(p2, p3, u)
  const p012 = pointLerp(p01, p12, u), p123 = pointLerp(p12, p23, u), mid = pointLerp(p012, p123, u)
  // Equal endpoint values cannot encode an intervening overshoot using an
  // easing-only keyframe model. Refuse instead of silently flattening it.
  if (Math.abs(mid.y) < 1e-12 || Math.abs(1 - mid.y) < 1e-12) return null
  const left: BezierTuple = { cx1: p01.x / mid.x, cy1: p01.y / mid.y, cx2: p012.x / mid.x, cy2: p012.y / mid.y }
  const right: BezierTuple = { cx1: (p123.x - mid.x) / (1 - mid.x), cy1: (p123.y - mid.y) / (1 - mid.y), cx2: (p23.x - mid.x) / (1 - mid.x), cy2: (p23.y - mid.y) / (1 - mid.y) }
  return { leading: { ...a, easing: { type: 'customBezier', bezier: left } }, inserted: make(lerp(vA, vB, mid.y), { type: 'customBezier', bezier: right }) }
}

/** Split the underlying easing, rather than writing an already-modified
 * evaluated value back into its input. Unsupported pipelines remain untouched.
 * roundTimeMs defaults to true for existing curve UI callers. Exact-time
 * authoring may set it false; near-key/support-key collisions still refuse
 * insertion rather than shifting or replacing an existing key. idForTime may
 * reserve stable IDs for repeated previews; it receives each actual inserted
 * time, including an easing midpoint. Without it, nextId retains ownership. */
export function insertCurveKeyframe(track: Track, timeMs: number, nextId: () => string,
  options: { roundTimeMs?: boolean; idForTime?: (timeMs: number) => string } = {}): InsertionResult {
  if (!Number.isFinite(timeMs)) return { ok: false, reason: 'Keyframe time must be finite.' }
  if (track.controller && track.controller.type !== 'keyframe') return { ok: false, reason: 'Bake the procedural controller before inserting a curve keyframe.' }
  if (track.easeCurve || track.timeWarp || track.multiplierCurve || track.modifiers?.some(mod => mod.enabled)
      || track.keyframes.some(key => key.segmentModifiers?.some(mod => mod.enabled))) {
    return { ok: false, reason: 'Bake modifiers and time remapping before inserting a curve keyframe; their evaluated output cannot safely become a new input key.' }
  }
  const keys = [...track.keyframes].sort((a, b) => a.timeMs - b.timeMs)
  if (!keys.length || keys.some(key => typeof key.value !== 'number' || !Number.isFinite(key.value))) return { ok: false, reason: 'This curve has no numeric keyframes to split.' }
  const ms = Math.max(0, options.roundTimeMs === false ? timeMs : Math.round(timeMs))
  const existing = keys.find(key => Math.abs(key.timeMs - ms) <= 1)
  if (existing) return { ok: false, reason: 'A keyframe already exists at this time.', existingId: existing.id }
  const index = keys.findIndex(key => key.timeMs > ms)
  if (index === 0 || index === -1) {
    if ([track.outOfRange?.before, track.outOfRange?.after].some(mode => mode && mode !== 'constant')) {
      return { ok: false, reason: 'Insert inside the keyed range to preserve out-of-range repetition.' }
    }
    const value = (index === 0 ? keys[0] : keys[keys.length - 1]).value
    const key: Keyframe = { id: options.idForTime?.(ms) ?? nextId(), timeMs: ms, value, easing: { type: 'linear' } }
    return { ok: true, track: { ...track, keyframes: [...keys, key].sort((a, b) => a.timeMs - b.timeMs) }, insertedIds: [key.id] }
  }
  let a = keys[index - 1], b = keys[index]
  const insertedIds: string[] = []
  if (a.easing?.type === 'easeInOut' && a.tangentMode !== 'linear' && a.value !== b.value) {
    // The built-in Ease In Out is two cubic polynomials. Keep its exact
    // midpoint as a support key before splitting either half.
    const midpoint = (a.timeMs + b.timeMs) / 2
    const mid: Keyframe = { id: options.idForTime?.(midpoint) ?? nextId(), timeMs: midpoint, value: ((a.value as number) + (b.value as number)) / 2, easing: { type: 'easeOut' }, tangentMode: 'broken' }
    a = { ...a, easing: { type: 'easeIn' } }
    keys[index - 1] = a
    keys.splice(index, 0, mid)
    insertedIds.push(mid.id)
    if (options.roundTimeMs === false ? ms === midpoint : Math.abs(ms - midpoint) <= 1) return { ok: true, track: { ...track, keyframes: keys }, insertedIds }
    if (options.roundTimeMs === false && Math.abs(ms - midpoint) <= 1) {
      return { ok: false, reason: 'An easing support key would collide with this exact time. Insert at the segment midpoint or choose a time more than 1 ms away.' }
    }
    if (ms < midpoint) b = mid
    else a = mid
  }
  const split = splitSegment(a, b, ms, options.idForTime?.(ms) ?? nextId())
  if (!split) return { ok: false, reason: 'This easing cannot be split here without changing its shape. Choose another time or bake the curve first.' }
  const result = keys.map(key => key.id === a.id ? split.leading : key)
  result.push(split.inserted)
  insertedIds.push(split.inserted.id)
  return { ok: true, track: { ...track, keyframes: result.sort((x, y) => x.timeMs - y.timeMs) }, insertedIds,
    ...(insertedIds.length > 1 ? { message: 'Added an easing midpoint as well to preserve the Ease In Out curve.' } : {}) }
}

export function makeReplaceCurveKeysCmd(timelineId: string, before: Track, after: Track): EditorCommand {
  const replace = (scene: ChronoScene, keys: Keyframe[]) => ({ ...scene, timelines: scene.timelines.map(timeline => timeline.id !== timelineId ? timeline : {
    ...timeline, tracks: timeline.tracks.map(track => track.target !== before.target ? track : { ...track, keyframes: keys }),
  }) })
  return { label: 'Insert Curve Keyframe', execute: scene => replace(scene, after.keyframes), undo: scene => replace(scene, before.keyframes) }
}
