/** Synchronous immutable-snapshot notification. Instances own only the current
 * borrowed value and subscriptions. Preview filtering belongs to the editor;
 * observer failures never roll back a committed edit. Unsubscribe is idempotent. */
export class CommittedSnapshot<T> {
  private readonly listeners = new Set<(value: T) => void>()
  constructor(private current: T) {}
  /** Borrow the latest committed identity, without cloning or transferring it. */
  getSnapshot = (): T => this.current
  /** Observe future publications; the returned cleanup may be called repeatedly. */
  subscribe = (listener: (value: T) => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  /** Publish a different immutable identity synchronously; isolate observer errors. */
  publish(value: T): void {
    if (value === this.current) return
    this.current = value
    for (const listener of Array.from(this.listeners)) try { listener(value) } catch { /* Notification cannot cancel the source change. */ }
  }
}
