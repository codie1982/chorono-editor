import type { ChronoScene } from '../../types'
import { sceneSourceData } from '../../format/scene/sceneSourceData'

/** Borrow immutable source while excluding runtime media and nested session
 * envelopes. Weak caches preserve sharing across history snapshots without
 * extending a discarded scene's lifetime. No original source is mutated. */
export class HistorySourceView {
  private readonly scenes = new WeakMap<ChronoScene, ChronoScene>()
  private readonly assets = new WeakMap<ChronoScene['assets'], ChronoScene['assets']>()
  /** Borrow/cache a runtime-free source view without modifying the input scene. */
  get(scene: ChronoScene): ChronoScene {
    const found = this.scenes.get(scene)
    if (found) return found
    const { editorSession, ...source } = scene as ChronoScene & { editorSession?: unknown }; void editorSession
    const view = sceneSourceData(source)
    const shared = this.assets.get(scene.assets)
    if (shared) view.assets = shared
    else this.assets.set(scene.assets, view.assets)
    this.scenes.set(scene, view)
    return view
  }
}
