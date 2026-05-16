'use client'
// ── useInteractiveRuntime ─────────────────────────────────────────────────────
// Owns the *ephemeral* state of the interactive runtime preview:
//
//   – Parameter overrides (preview slider values; reset on demand)
//   – External event queue (clicks, customEvent fires from the preview panel)
//   – Active segment playback (driven by playSegment / stopSegment)
//
// None of this state is ever written to the scene tree or the undo history —
// it's purely a runtime simulation layer that lives alongside the editor
// state. The hook exposes `evaluateFrame()` which the canvas calls each
// render to get the final OverrideMap (timeline + param + binding) PLUS
// fires any lifecycle / trigger callbacks for the elapsed frame.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChronoScene, SceneParameterValue, TimelineSegment,
} from '@/lib/types'
import {
  evaluateTimelines, mergeOverrides,
  type OverrideMap, type ExternalTimelineTime,
} from '@/lib/evaluator'
import {
  buildParamValues, applyParamBindingsToOverrides,
  type ParamValueMap,
} from '@/lib/runtime/paramResolver'
import { evaluateBindings } from '@/lib/runtime/bindingEvaluator'
import {
  evaluateTriggers,
  type RuntimeEvent, type ResolvedAction,
} from '@/lib/runtime/triggerEngine'
import {
  detectLifecycleEvents, computeVisibleLayerIds, emptySnapshot,
  type PlaybackSnapshot,
} from '@/lib/runtime/lifecycleEmitter'
import {
  startSegment, computeSegmentTime, isSegmentComplete,
  type SegmentPlaybackState,
} from '@/lib/runtime/segmentPlayer'

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface FrameEvalResult {
  /** Final OverrideMap to be passed into the renderer. */
  overrides:    OverrideMap
  /** Resolved parameter values used during this frame. */
  paramValues:  ParamValueMap
  /** Any events that fired this frame — useful for debugging. */
  events:       RuntimeEvent[]
  /** Actions that were executed (param / segment side effects). */
  actions:      ResolvedAction[]
  /** Segment playback state (null when timeline is in normal mode). */
  segmentState: SegmentPlaybackState | null
}

export interface InteractiveRuntimeReturn {
  /** Live parameter values: defaults merged with preview overrides. */
  paramValues: ParamValueMap
  /** Override a single parameter (e.g. from a preview slider). */
  setParamOverride: (paramId: string, value: SceneParameterValue) => void
  /** Restore all parameters to their authored defaults. */
  resetParams: () => void

  /** Queue an external event (button click, drag, customEvent). */
  fireEvent: (event: RuntimeEvent) => void

  /** Active segment state (null = normal full-timeline playback). */
  segmentState: SegmentPlaybackState | null
  /** Begin playing a named segment. */
  playSegment: (timelineId: string, segmentId: string, loop?: boolean) => void
  /** Stop segment playback (returns to global timeline). */
  stopSegment: () => void

  /** Subscribe to lifecycle / trigger events (Android-bridge style). */
  onEvent: (listener: (event: RuntimeEvent) => void) => () => void

  /** Per-frame pipeline. Call from the render loop with the global time. */
  evaluateFrame: (globalTimeMs: number) => FrameEvalResult
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

export function useInteractiveRuntime(scene: ChronoScene): InteractiveRuntimeReturn {
  // ── Parameter overrides (reactive — sliders re-render) ──────────────────
  const [overridesVersion, setOverridesVersion] = useState(0)
  const overridesRef = useRef<Map<string, SceneParameterValue>>(new Map())

  const setParamOverride = useCallback((paramId: string, value: SceneParameterValue) => {
    overridesRef.current.set(paramId, value)
    setOverridesVersion((v) => v + 1)
  }, [])

  const resetParams = useCallback(() => {
    overridesRef.current.clear()
    setOverridesVersion((v) => v + 1)
  }, [])

  // ── Pending events queue (drained each frame) ──────────────────────────
  const eventQueueRef = useRef<RuntimeEvent[]>([])

  const fireEvent = useCallback((event: RuntimeEvent) => {
    eventQueueRef.current.push(event)
  }, [])

  // ── Segment playback ───────────────────────────────────────────────────
  const [segmentState, setSegmentState] = useState<SegmentPlaybackState | null>(null)
  const segmentRef = useRef<SegmentPlaybackState | null>(null)
  // keep ref + state in sync
  useEffect(() => { segmentRef.current = segmentState }, [segmentState])

  const playSegment = useCallback((timelineId: string, segmentId: string, loop = false) => {
    const tl = scene.timelines.find((t) => t.id === timelineId)
    const segs: TimelineSegment[] = tl?.segments ?? []
    const seg = segs.find((s) => s.id === segmentId)
    if (!seg) return
    const next = startSegment(timelineId, seg, loop, performance.now())
    segmentRef.current = next
    setSegmentState(next)
  }, [scene.timelines])

  const stopSegment = useCallback(() => {
    segmentRef.current = null
    setSegmentState(null)
  }, [])

  // ── Listener registry ──────────────────────────────────────────────────
  const listenersRef = useRef<Set<(event: RuntimeEvent) => void>>(new Set())
  const onEvent = useCallback((listener: (event: RuntimeEvent) => void) => {
    listenersRef.current.add(listener)
    return () => { listenersRef.current.delete(listener) }
  }, [])

  // ── Snapshot for lifecycle diffing ─────────────────────────────────────
  const prevSnapshotRef = useRef<PlaybackSnapshot>(emptySnapshot())

  // ── Per-frame evaluation ───────────────────────────────────────────────
  const evaluateFrame = useCallback((globalTimeMs: number): FrameEvalResult => {
    const paramValues = buildParamValues(scene.parameters, overridesRef.current)

    // Segment time override for the active timeline (if any).
    const seg = segmentRef.current
    const externalTime: ExternalTimelineTime | null = seg
      ? { timelineId: seg.timelineId, localTimeMs: computeSegmentTime(seg, performance.now()) }
      : null

    const baseOverrides   = evaluateTimelines(scene.timelines, globalTimeMs, externalTime)
    const paramOverrides  = applyParamBindingsToOverrides(scene.layers, paramValues, baseOverrides)
    const bindingOverrides = evaluateBindings(scene.bindings, paramOverrides, paramValues, scene)
    const overrides = mergeOverrides(bindingOverrides) // bindingOverrides already wraps paramOverrides

    // ── Build new snapshot ────────────────────────────────────────────────
    const activeTimelineId = scene.timelines.find((t) => t.autoplay)?.id
      ?? scene.timelines[0]?.id
      ?? null
    const nextSnapshot: PlaybackSnapshot = {
      timeMs: globalTimeMs,
      isPlaying: true,
      activeSegmentId:  seg?.segmentId ?? null,
      activeTimelineId,
      visibleLayerIds:  computeVisibleLayerIds(scene, globalTimeMs),
      loopCount: prevSnapshotRef.current.loopCount
        + (globalTimeMs < prevSnapshotRef.current.timeMs ? 1 : 0),
    }

    // ── Detect lifecycle events + drain external queue ────────────────────
    const lifecycleEvents = detectLifecycleEvents(scene, prevSnapshotRef.current, nextSnapshot)
    const externalEvents  = eventQueueRef.current.splice(0)
    const allEvents = lifecycleEvents.concat(externalEvents)

    // ── Trigger engine → actions ──────────────────────────────────────────
    const actions = evaluateTriggers(scene.triggers, allEvents, paramValues)
    actions.forEach((action) => applyAction(action))

    // ── Auto-stop completed non-loop segments ─────────────────────────────
    if (seg && isSegmentComplete(seg, performance.now())) {
      segmentRef.current = null
      // Defer state set to avoid re-render storm inside the loop.
      queueMicrotask(() => setSegmentState(null))
    }

    // ── Notify listeners ──────────────────────────────────────────────────
    if (allEvents.length && listenersRef.current.size) {
      const ls = Array.from(listenersRef.current)
      allEvents.forEach((e) => ls.forEach((l) => l(e)))
    }

    prevSnapshotRef.current = nextSnapshot

    return {
      overrides,
      paramValues,
      events:  allEvents,
      actions,
      segmentState: segmentRef.current,
    }
  }, [scene])

  // ── Action dispatcher ──────────────────────────────────────────────────
  const applyAction = useCallback((action: ResolvedAction) => {
    switch (action.type) {
      case 'setParam': {
        if (!action.paramId) return
        // Dynamic value source from the firing event (drag dx/dy/progress)
        // takes priority over the static paramValue.
        let value: any = action.paramValue
        if (action.paramValueFrom) {
          const ev = action.sourceEvent
          switch (action.paramValueFrom) {
            case 'event.progress': value = ev.progress ?? 0; break
            case 'event.dx':       value = ev.dx       ?? 0; break
            case 'event.dy':       value = ev.dy       ?? 0; break
          }
        }
        if (value !== undefined) {
          overridesRef.current.set(action.paramId, value)
          setOverridesVersion((v) => v + 1)
        }
        return
      }
      case 'playSegment': {
        if (action.segmentId) {
          // Find the timeline that owns this segment.
          for (const tl of scene.timelines) {
            const segs: TimelineSegment[] = tl.segments ?? []
            const seg = segs.find((s) => s.id === action.segmentId)
            if (!seg) continue
            const next = startSegment(tl.id, seg, action.loop ?? false, performance.now())
            segmentRef.current = next
            setSegmentState(next)
            return
          }
        }
        return
      }
      case 'emitEvent': {
        if (action.eventName) {
          fireEvent({ type: 'customEvent', refId: action.eventName })
        }
        return
      }
      // play / pause / stop / reverse / seek are no-ops here; the host's
      // usePlayback hook owns the global playhead. In V1 the trigger engine
      // surfaces these as events for the host to wire up if desired.
      default: return
    }
  }, [scene, fireEvent])

  // ── Live param value snapshot (cheap derived value) ────────────────────
  const paramValues = useMemo(
    () => buildParamValues(scene.parameters, overridesRef.current),
    [scene.parameters, overridesVersion],
  )

  return {
    paramValues,
    setParamOverride,
    resetParams,
    fireEvent,
    segmentState,
    playSegment,
    stopSegment,
    onEvent,
    evaluateFrame,
  }
}
