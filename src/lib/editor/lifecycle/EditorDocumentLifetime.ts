/** Runtime document identity independent of scene names, revisions and undo.
 * Replacement aborts the previous identity synchronously; ordinary edits never
 * call replace. Consumers borrow the signal and cannot cancel the document.
 * No controllers enter scene JSON. stop defers unmount abort one microtask so
 * React StrictMode setup/cleanup/setup preserves the live document identity. */
export class EditorDocumentLifetime {
  private controller = new AbortController()
  private active = true

  /** Current document identity; callers read again when starting asynchronous work. */
  get signal(): AbortSignal { return this.controller.signal }

  /** Start/restart observation after layout setup, including StrictMode replay. */
  start(): void { this.active = true }

  /** Abort on actual unmount; synchronous restart cancels this deferred stop. */
  stop(): void {
    this.active = false
    const previous = this.controller
    queueMicrotask(() => { if (!this.active && this.controller === previous) previous.abort() })
  }

  /** Create identity before notifying old listeners so reentrant reads see the
   * replacement. Even identical scene IDs represent a new document on reset. */
  replace(): void {
    const previous = this.controller
    this.controller = new AbortController()
    previous.abort()
  }
}
