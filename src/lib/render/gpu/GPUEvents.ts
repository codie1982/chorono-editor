// ── GPUEvents ─────────────────────────────────────────────────────────────────
//
// Typed event surface for the GPU rendering subsystem.
//
// Honors the project-wide convention (arch_scripting_event_system): every class
// exposes its events so consoles, diagnostics, and future tooling can hook them.
// These are INFRASTRUCTURE events (context loss, backend lifecycle, render
// errors) — deliberately distinct from user-scriptable scene events
// (TriggerEventType). Keeping them on a local emitter means the scripting
// trigger union stays scene-focused while GPU classes still satisfy the
// "expose your events" rule.

export type GPUEventType =
  | 'gpu:probe-complete'
  | 'gpu:backend-created'
  | 'gpu:context-lost'
  | 'gpu:context-restored'
  | 'gpu:render-complete'
  | 'gpu:render-error'
  | 'gpu:dispose'

export interface GPUEvent {
  type: GPUEventType
  /** Identifies the emitting class (backend / capability source). */
  source: string
  /** Optional diagnostic payload (particle count, tier, error message). */
  detail?: Record<string, unknown>
}

export type GPUEventListener = (event: GPUEvent) => void

/**
 * Base class providing on/onAny subscription and a protected emit().
 * Subclasses declare their identity via the abstract eventSourceId getter.
 */
export abstract class GPUEventEmitter {
  private byType = new Map<GPUEventType, Set<GPUEventListener>>()
  private anyListeners = new Set<GPUEventListener>()

  protected abstract get eventSourceId(): string

  /** Subscribe to one event type. Returns an unsubscribe function. */
  on(type: GPUEventType, listener: GPUEventListener): () => void {
    let set = this.byType.get(type)
    if (!set) {
      set = new Set()
      this.byType.set(type, set)
    }
    set.add(listener)
    return () => set!.delete(listener)
  }

  /** Subscribe to every emitted event. Returns an unsubscribe function. */
  onAny(listener: GPUEventListener): () => void {
    this.anyListeners.add(listener)
    return () => this.anyListeners.delete(listener)
  }

  protected emit(type: GPUEventType, detail?: Record<string, unknown>): void {
    const event: GPUEvent = { type, source: this.eventSourceId, detail }
    const typed = this.byType.get(type)
    if (typed) for (const l of Array.from(typed)) l(event)
    for (const l of Array.from(this.anyListeners)) l(event)
  }
}
