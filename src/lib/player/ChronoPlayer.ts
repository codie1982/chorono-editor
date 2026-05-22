// ── ChronoPlayer ──────────────────────────────────────────────────────────────
//
// Framework-free runtime player. The React-free port of useInteractiveRuntime +
// useSMRuntime + usePlayback: same evaluation pipeline, same StateMachineRuntime,
// same trigger/segment/binding engines — zero duplication, identical behaviour
// to the editor's Test Mode.
//
// Design rules (project_sm_v2_roadmap, non-negotiable):
//   1. Shared runtime — reuses the editor's engines, no forks
//   2. No editor/React/DOM in the core — the only DOM touch is the injected
//      RenderAdapter (web) and the optional rAF clock for play()
//   3. Visual fidelity — renders via CanvasRenderer in preview mode
//   4. Event-driven — every frame's lifecycle/trigger events flow through
//      EventBridge (arch_scripting_event_system convention)
//
// Cross-platform protocol (same on web / android / core):
//   play/pause/stop/seek · dispatch(event) · setParam(name,val) · on(evt,cb)

import type { ChronoScene, SceneParameterValue, TimelineSegment, TriggerEventType } from '@/lib/types'
import type { AssetElementMap } from '@/lib/renderer'
import {
  evaluateTimelines, mergeOverrides,
  type OverrideMap, type ExternalTimelineTime,
} from '@/lib/evaluator'
import {
  StateMachineRuntime, blendOverrides, type ParamLookup,
} from '@/lib/statemachine'
import {
  buildParamValues, applyParamBindingsToOverrides,
  type ParamValueMap,
} from '@/lib/runtime/paramResolver'
import { evaluateBindings } from '@/lib/runtime/bindingEvaluator'
import { evaluateParameterWires } from '@/lib/runtime/parameterWireEvaluator'
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
import type { SMAction } from '@/lib/types'
import { reconcileStateMachines } from './RuntimeSceneLoader'
import { EventBridge } from './EventBridge'
import type { RenderAdapter } from './RenderAdapter'

export interface ChronoPlayerOptions {
  /** DOM elements (images/video) keyed by Asset.id. Default empty. */
  assets?: AssetElementMap
  /** Loop the global timeline at composition.durationMs. Default true. */
  loop?: boolean
}

export interface FrameResult {
  overrides: OverrideMap
  paramValues: ParamValueMap
  events: RuntimeEvent[]
  actions: ResolvedAction[]
  segmentState: SegmentPlaybackState | null
}

const now = (): number =>
  (typeof performance !== 'undefined' ? performance.now() : Date.now())

export class ChronoPlayer {
  private _scene: ChronoScene
  private _assets: AssetElementMap
  private _adapter: RenderAdapter | null
  private _events = new EventBridge()

  private _smRuntimes = new Map<string, StateMachineRuntime>()
  private _eventQueue: RuntimeEvent[] = []
  private _smEventQueue: Array<{ smId?: string; event: string }> = []
  private _paramOverrides = new Map<string, SceneParameterValue>()
  private _segment: SegmentPlaybackState | null = null
  private _prevSnapshot: PlaybackSnapshot = emptySnapshot()

  // ── Playback clock ──────────────────────────────────────────────────────────
  private _playing = false
  private _loop: boolean
  private _startWall = 0       // wall-clock at last (re)start
  private _offsetMs = 0        // timeline position banked at last pause/seek
  private _rafId: number | null = null

  constructor(scene: ChronoScene, adapter: RenderAdapter | null = null, opts: ChronoPlayerOptions = {}) {
    this._scene = scene
    this._adapter = adapter
    this._assets = opts.assets ?? new Map()
    this._loop = opts.loop ?? true
    this._smRuntimes = reconcileStateMachines(scene)
  }

  // ── Scene / adapter wiring ────────────────────────────────────────────────

  load(scene: ChronoScene, assets?: AssetElementMap): void {
    this._scene = scene
    if (assets) this._assets = assets
    this._smRuntimes = reconcileStateMachines(scene, this._smRuntimes)
    this._prevSnapshot = emptySnapshot()
  }

  setAdapter(adapter: RenderAdapter): void {
    this._adapter = adapter
  }

  get currentTimeMs(): number {
    return this._offsetMs
  }

  get isPlaying(): boolean {
    return this._playing
  }

  get smRuntimes(): Map<string, StateMachineRuntime> {
    return this._smRuntimes
  }

  // ── Subscriptions (cross-platform `on`) ────────────────────────────────────

  on(type: TriggerEventType, listener: (event: RuntimeEvent) => void): () => void {
    return this._events.on(type, listener)
  }

  onAny(listener: (event: RuntimeEvent) => void): () => void {
    return this._events.onAny(listener)
  }

  // ── Inputs ─────────────────────────────────────────────────────────────────

  /** Queue an external runtime event (click, drag, customEvent). */
  fireEvent(event: RuntimeEvent): void {
    this._eventQueue.push(event)
  }

  /** Dispatch a state-machine event by name. Broadcast when smId omitted. */
  dispatch(event: string, smId?: string): void {
    this._smEventQueue.push({ smId, event })
  }

  /** Override a scene parameter (e.g. host-supplied value). */
  setParam(name: string, value: SceneParameterValue): void {
    this._paramOverrides.set(name, value)
  }

  resetParams(): void {
    this._paramOverrides.clear()
  }

  // ── Segment playback ─────────────────────────────────────────────────────--

  playSegment(timelineId: string, segmentId: string, loop = false): void {
    const tl = this._scene.timelines.find((t) => t.id === timelineId)
    const seg = (tl?.segments ?? []).find((s) => s.id === segmentId)
    if (!seg) return
    this._segment = startSegment(timelineId, seg, loop, now())
  }

  stopSegment(): void {
    this._segment = null
  }

  // ── Playback control ───────────────────────────────────────────────────────

  play(): void {
    if (this._playing) return
    this._playing = true
    this._startWall = now()
    this._startRaf()
  }

  pause(): void {
    if (!this._playing) return
    this._offsetMs = this._clockTimeMs()
    this._playing = false
    this._stopRaf()
  }

  stop(): void {
    this.pause()
    this.seek(0)
  }

  seek(timeMs: number): void {
    this._offsetMs = timeMs
    this._startWall = now()
    this.tick(timeMs)
  }

  /** Tear down clock + listeners. */
  destroy(): void {
    this._stopRaf()
    this._events.clear()
  }

  // ── Per-frame evaluation (host-driven; also used by the rAF loop) ───────────
  //
  // Pure enough to call from Node tests with an explicit time. Returns the
  // evaluated frame and renders it through the adapter when one is attached.
  tick(globalTimeMs: number): FrameResult {
    const scene = this._scene
    const paramValues = buildParamValues(scene.parameters, this._paramOverrides)
    const wallMs = now()

    const externalTime: ExternalTimelineTime | null = this._segment
      ? { timelineId: this._segment.timelineId, localTimeMs: computeSegmentTime(this._segment, wallMs) }
      : null

    const getParam: ParamLookup = (name) => paramValues.get(name)
    let baseOverrides: OverrideMap
    let smActiveTimelineId: string | null = null

    if (this._smRuntimes.size > 0) {
      const smRes = this._tickStateMachines(globalTimeMs, getParam, wallMs)
      const nonSm = scene.timelines.filter((t) => !smRes.ownedTimelineIds.has(t.id))
      baseOverrides = mergeOverrides(evaluateTimelines(nonSm, globalTimeMs, externalTime), smRes.overrides)

      for (const a of smRes.actions) {
        if (a.type === 'setParam' && a.param !== undefined && a.value !== undefined) {
          this._paramOverrides.set(a.param, a.value)
        } else if (a.type === 'emitEvent' && a.event) {
          this.fireEvent({ type: 'customEvent', refId: a.event })
        }
      }

      for (const rt of Array.from(this._smRuntimes.values())) {
        if (rt.activeTimelineId) { smActiveTimelineId = rt.activeTimelineId; break }
      }
    } else {
      baseOverrides = evaluateTimelines(scene.timelines, globalTimeMs, externalTime)
    }

    const paramOverrides   = applyParamBindingsToOverrides(scene.layers, paramValues, baseOverrides)
    const bindingOverrides = evaluateBindings(scene.bindings, paramOverrides, paramValues, scene)
    const wireOverrides    = evaluateParameterWires(scene.parameterWires, bindingOverrides, paramValues, scene)
    const overrides = mergeOverrides(wireOverrides)

    const activeTimelineId = smActiveTimelineId
      ?? scene.timelines.find((t) => t.autoplay)?.id
      ?? scene.timelines[0]?.id
      ?? null

    const nextSnapshot: PlaybackSnapshot = {
      timeMs: globalTimeMs,
      isPlaying: this._playing,
      activeSegmentId: this._segment?.segmentId ?? null,
      activeTimelineId,
      visibleLayerIds: computeVisibleLayerIds(scene, globalTimeMs),
      loopCount: this._prevSnapshot.loopCount + (globalTimeMs < this._prevSnapshot.timeMs ? 1 : 0),
    }

    const lifecycleEvents = detectLifecycleEvents(scene, this._prevSnapshot, nextSnapshot)
    const externalEvents = this._eventQueue.splice(0)
    const allEvents = lifecycleEvents.concat(externalEvents)

    const actions = evaluateTriggers(scene.triggers, allEvents, paramValues)
    actions.forEach((action) => this._applyAction(action))

    if (this._segment && isSegmentComplete(this._segment, wallMs)) {
      this._segment = null
    }

    this._events.emitAll(allEvents)
    this._prevSnapshot = nextSnapshot

    if (this._adapter) {
      this._adapter.render({ scene, timeMs: globalTimeMs, overrides, paramValues, assets: this._assets })
    }

    return { overrides, paramValues, events: allEvents, actions, segmentState: this._segment }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** Port of useSMRuntime.tickFrame — no React, same blend logic. */
  private _tickStateMachines(globalTimeMs: number, getParam: ParamLookup, wallMs: number): {
    overrides: OverrideMap; ownedTimelineIds: Set<string>; actions: SMAction[]
  } {
    const scene = this._scene
    const owned = new Set<string>()
    const actions: SMAction[] = []
    const contributions: OverrideMap[] = []

    // SM events come from two sources: targeted dispatch() calls (drained), and
    // queued customEvents bridged as broadcasts (peeked — the trigger engine
    // still drains _eventQueue in tick()).
    const smEvents: Array<{ smId?: string; event: string }> = this._smEventQueue.splice(0)
    for (const e of this._eventQueue) {
      if (e.type === 'customEvent' && e.refId) smEvents.push({ event: e.refId })
    }

    this._smRuntimes.forEach((rt) => {
      rt.sm.states.forEach((s) => owned.add(s.timelineId))

      for (const e of smEvents) {
        if (e.smId && e.smId !== rt.sm.id) continue
        const fired = rt.dispatch(e.event, getParam, wallMs)
        if (fired.length) actions.push(...fired)
      }
      const auto = rt.tickGuards(getParam, wallMs)
      if (auto.length) actions.push(...auto)

      const blend = rt.getBlend(wallMs)
      if (blend) {
        const fromTl = scene.timelines.find((t) => t.id === blend.fromTimelineId)
        const toTl   = scene.timelines.find((t) => t.id === blend.toTimelineId)
        const fromOv = fromTl ? evaluateTimelines([fromTl], globalTimeMs) : new Map<string, number>()
        const toOv   = toTl   ? evaluateTimelines([toTl],   globalTimeMs) : new Map<string, number>()
        contributions.push(blendOverrides(fromOv, toOv, blend.alpha))
      } else if (rt.activeTimelineId) {
        const tl = scene.timelines.find((t) => t.id === rt.activeTimelineId)
        if (tl) contributions.push(evaluateTimelines([tl], globalTimeMs))
      }
    })

    return {
      overrides: contributions.length ? mergeOverrides(...contributions) : new Map<string, number>(),
      ownedTimelineIds: owned,
      actions,
    }
  }

  private _applyAction(action: ResolvedAction): void {
    switch (action.type) {
      case 'setParam': {
        if (!action.paramId) return
        let value: SceneParameterValue | undefined = action.paramValue
        if (action.paramValueFrom) {
          const ev = action.sourceEvent
          if (action.paramValueFrom === 'event.progress') value = ev.progress ?? 0
          else if (action.paramValueFrom === 'event.dx')   value = ev.dx ?? 0
          else if (action.paramValueFrom === 'event.dy')   value = ev.dy ?? 0
        }
        if (value !== undefined) this._paramOverrides.set(action.paramId, value)
        return
      }
      case 'playSegment': {
        if (!action.segmentId) return
        for (const tl of this._scene.timelines) {
          const seg = (tl.segments ?? []).find((s: TimelineSegment) => s.id === action.segmentId)
          if (seg) { this._segment = startSegment(tl.id, seg, action.loop ?? false, now()); return }
        }
        return
      }
      case 'emitEvent': {
        if (action.eventName) this.fireEvent({ type: 'customEvent', refId: action.eventName })
        return
      }
      default: return
    }
  }

  // ── rAF clock (web convenience; tick() stays host-callable for tests) ───────

  private _clockTimeMs(): number {
    const duration = this._scene.composition.durationMs
    let elapsed = this._offsetMs + (now() - this._startWall)
    if (duration > 0) {
      elapsed = this._loop ? elapsed % duration : Math.min(elapsed, duration)
    }
    return elapsed
  }

  private _startRaf(): void {
    if (typeof requestAnimationFrame === 'undefined') return // host-driven (Node): caller uses tick()
    const loop = () => {
      if (!this._playing) return
      const t = this._clockTimeMs()
      this.tick(t)
      if (!this._loop && this._scene.composition.durationMs > 0 && t >= this._scene.composition.durationMs) {
        this._playing = false
        this._rafId = null
        return
      }
      this._rafId = requestAnimationFrame(loop)
    }
    this._rafId = requestAnimationFrame(loop)
  }

  private _stopRaf(): void {
    if (this._rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this._rafId)
    }
    this._rafId = null
  }
}
