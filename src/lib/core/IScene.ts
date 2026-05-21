// ── IScene ────────────────────────────────────────────────────────────────────
// Abstract scene container. ChronoScene (2D animation) implements this.
// Future modes (game level, video sequence, 3D world) extend it with their
// own object and timeline types.

import type { EditorMode } from './EditorMode'
import type { ISceneObject } from './ISceneObject'
import type { ITimeline } from './ITimeline'
import type { Asset } from '@/lib/types/media'

export interface IScene {
  id: string
  name: string
  /** Identifies which mode produced and owns this scene. */
  mode: EditorMode
  formatVersion: string
  /** Shared asset pool — images, videos, audio referenced by objects. */
  assets: Asset[]

  // ── Scene graph ────────────────────────────────────────────────────────────
  /** All scene objects. Hierarchy is expressed via ISceneObject.parentId. */
  objects: ISceneObject[]

  // ── Time ──────────────────────────────────────────────────────────────────
  /**
   * All timelines owned by this scene.
   *
   * In 2D animation: each Timeline is an independent animation sequence.
   * A StateMachine state maps to one of these timelines (ChronoSMState.timelineId).
   *
   * In future modes:
   *   Video editor  → TimelineVideo[]  (clip tracks)
   *   Game engine   → TimelineGame[]   (SM + event queue)
   *   3D modeling   → Timeline3D[]     (keyframes + camera paths)
   */
  timelines: ITimeline[]
}
