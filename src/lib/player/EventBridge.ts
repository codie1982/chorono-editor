// ── EventBridge ───────────────────────────────────────────────────────────────
//
// Runtime event hub for ChronoPlayer. Satisfies the project-wide convention
// (arch_scripting_event_system): every runtime action is exposed as a
// RuntimeEvent so scripts, consoles and platform SDKs can hook it.
//
// Two subscription forms, matching the cross-platform player protocol
// (project_sm_v2_roadmap → `on(eventName, cb)`):
//   • on(type, cb)  — listen to one RuntimeEvent type ('click', 'animationComplete', …)
//   • onAny(cb)     — listen to every emitted event (Console / SDK bridge)

import type { RuntimeEvent } from '@/lib/runtime/triggerEngine'
import type { TriggerEventType } from '@/lib/types'

type EventListener = (event: RuntimeEvent) => void

export class EventBridge {
  private byType = new Map<TriggerEventType, Set<EventListener>>()
  private anyListeners = new Set<EventListener>()

  /** Subscribe to a single event type. Returns an unsubscribe function. */
  on(type: TriggerEventType, listener: EventListener): () => void {
    let set = this.byType.get(type)
    if (!set) {
      set = new Set()
      this.byType.set(type, set)
    }
    set.add(listener)
    return () => set!.delete(listener)
  }

  /** Subscribe to every emitted event. Returns an unsubscribe function. */
  onAny(listener: EventListener): () => void {
    this.anyListeners.add(listener)
    return () => this.anyListeners.delete(listener)
  }

  /** Emit one event to type-specific and catch-all listeners. */
  emit(event: RuntimeEvent): void {
    const typed = this.byType.get(event.type)
    if (typed) for (const l of Array.from(typed)) l(event)
    for (const l of Array.from(this.anyListeners)) l(event)
  }

  /** Emit a batch (per-frame lifecycle + external events). */
  emitAll(events: RuntimeEvent[]): void {
    for (const e of events) this.emit(e)
  }

  /** Drop all subscriptions (player teardown). */
  clear(): void {
    this.byType.clear()
    this.anyListeners.clear()
  }
}
