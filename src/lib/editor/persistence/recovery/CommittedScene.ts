import type { ChronoScene } from '../../../types'

/** Observable committed source, independent of React renders and transient drag
 * previews. Borrowed immutable scenes are never cloned here. Subscribers run
 * synchronously after a successful commit/reset/undo/redo; observer failures
 * cannot roll back an edit. The subscriber owns its idempotent unsubscribe.
 */
export class CommittedScene {
  private readonly listeners = new Set<(scene: ChronoScene) => void>()
  constructor(private current: ChronoScene) {}
  getScene = (): ChronoScene => this.current
  subscribe = (listener: (scene: ChronoScene) => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  /** Same-identity publication is a no-op; no intermediate gesture is persisted. */
  publish(scene: ChronoScene): void {
    if (scene === this.current) return
    this.current = scene
    for (const listener of Array.from(this.listeners)) try { listener(scene) } catch { /* A save failure must not undo the user's edit. */ }
  }
}
