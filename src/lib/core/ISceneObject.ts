// ── ISceneObject ──────────────────────────────────────────────────────────────
// Base interface for every object that lives in a scene graph, regardless of
// mode. Layer2D, GameObject, Object3D etc. all extend this.

import type { EditorMode } from './EditorMode'

export interface ISceneObject {
  id: string
  name: string
  /** Which mode this object belongs to. Used for type-guard dispatch. */
  mode: EditorMode
  /** Parent group/node id. undefined = root level. */
  parentId?: string
  // ── Visibility / editability ───────────────────────────────────────────────
  // Optional to stay backward-compatible with existing Layer data that omits
  // these fields. Layer2D uses `hidden?` (inverted) for legacy reasons;
  // future mode objects should prefer `visible`.
  visible?: boolean
  locked?: boolean
}

// ── Type guards ───────────────────────────────────────────────────────────────

export function isSceneObject2D(obj: ISceneObject): boolean {
  return obj.mode === '2danimation'
}
