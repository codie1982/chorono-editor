import { createLatestFrameScheduler } from '@/lib/timeline/latestFrameScheduler'

export interface RuntimeFrameSignal {
  readonly frameRevision: number
  readonly segmentTick: number
  readonly smTestTick: number
}

/**
 * One host-owned frame signal for segment/test playback and queued input. It
 * publishes once per scheduled browser frame even when both continuous demands
 * and many input invalidations coexist. No scene/event/value payload is held;
 * it never advances, rounds or pauses domain clocks. Hosts still evaluate all
 * queued inputs in order. Counters retain their last values while inactive.
 *
 * start/stop are idempotent. stop cancels the sole pending callback and prevents
 * publication; pending dirty intent survives start/stop (React StrictMode effect
 * replay), without retaining a scheduled task. The host releases the instance
 * on final unmount. Injected scheduling must defer callbacks, as RAF does. A
 * host-driven playback clock suppresses this scheduler's RAF; acknowledge at
 * evaluation start retains feedback for the next host frame or a pause boundary.
 * Publication errors propagate with no automatic retry loop.
 */
export class RuntimeFrameScheduler {
  private running = false
  private dirty = false
  private segment = false
  private stateMachine = false
  private hostDriven = false
  private signal: RuntimeFrameSignal = { frameRevision: 0, segmentTick: 0, smTestTick: 0 }
  private readonly task: ReturnType<typeof createLatestFrameScheduler<void>>

  constructor(private readonly publish: (signal: RuntimeFrameSignal) => void,
    schedule: (callback: (timeMs: number) => void) => number,
    cancel: (id: number) => void) {
    this.task = createLatestFrameScheduler(() => this.flush(), schedule, cancel)
  }

  /** Enable publication; an idle, clean instance allocates no frame task. */
  start(): void { this.running = true; this.reconcile() }
  /** Cancel pending publication, preserving dirty intent for effect replay. */
  stop(): void { this.running = false; this.task.cancel() }
  /** Replace continuous demand. Removing the last demand cancels a clean task;
   * pending input is published once unless hostDriven supplies evaluation from
   * its own playback clock. No source time changes or clock readings occur. */
  setDemand(segment: boolean, stateMachine: boolean, hostDriven = false): void {
    this.segment = segment; this.stateMachine = stateMachine; this.hostDriven = hostDriven; this.reconcile()
  }
  /** The host has begun evaluating queued input. New feedback invalidated
   * during that pass remains dirty. Hosts driving their own playback must call
   * this before draining input, so stopping playback cannot replay old intent. */
  acknowledge(): void { this.dirty = false; this.reconcile() }
  /** Request one evaluation even while the global playhead is paused. Repeated
   * calls coalesce scheduling only; event payloads remain in the host queue. */
  invalidate(): void { this.dirty = true; this.reconcile() }

  /** Reuse the existing latest-frame task; there is never a second RAF lane. */
  private reconcile(): void {
    if (!this.running) return
    if (!this.hostDriven && (this.dirty || this.segment || this.stateMachine)) this.task.push()
    else this.task.cancel()
  }
  /** Publish detached immutable counters and honor reentrant stop/invalidation. */
  private flush(): void {
    if (!this.running) return
    this.dirty = false
    this.signal = { frameRevision: this.signal.frameRevision + 1,
      segmentTick: this.signal.segmentTick + Number(this.segment),
      smTestTick: this.signal.smTestTick + Number(this.stateMachine) }
    this.publish(this.signal)
    this.reconcile()
  }
}
