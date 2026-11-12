import type { ChronoScene } from '../../types'
import type { EditorCommand } from '../commands-keyframe'
import type { SceneGuide, SceneGuideData } from '../../geometry/guides/SceneGuide'

export type { SceneGuide, SceneGuideData } from '../../geometry/guides/SceneGuide'
import { assertSceneGuides } from '../../geometry/guides/sceneGuideData'
export { assertSceneGuides, readSceneGuides, MAX_SCENE_GUIDES, MAX_GUIDE_POSITION } from '../../geometry/guides/sceneGuideData'

/** Reject an event captured from stale guide DOM before opening a transaction
 * or deleting/updating source. Identity is meaningful because editor source is
 * immutable; an equal replacement record is still a newer authored value. */
export function assertCurrentSceneGuide(guides: readonly SceneGuide[], expected: SceneGuide): void {
  if (guides.find(guide => guide.id === expected.id) !== expected) throw new Error('The guide changed. Review its current value before applying.')
}

/** Create one immutable source edit, preserving every unrelated scene field.
 * Source identity guards stale numeric edits. Undo restores the exact optional
 * payload (including absence on old projects); redo reuses stable guide IDs.
 * Coordinate changes to locked guides are rejected, while unlock/hide/delete
 * remain explicit commands. Returned command owns copies of the input records. */
export function makeSceneGuidesCmd(base: ChronoScene, guides: readonly SceneGuide[], label = 'Edit guides'): EditorCommand {
  const previous = base.editorGuides, next: SceneGuideData = { version: 1, guides: guides.map(guide => ({ ...guide })) }
  assertSceneGuides(previous); assertSceneGuides(next)
  for (const guide of previous?.guides ?? []) {
    const replacement = next.guides.find(item => item.id === guide.id)
    if (guide.locked && replacement && (replacement.position !== guide.position || replacement.axis !== guide.axis)) throw new Error('Unlock this guide before moving it.')
  }
  return { label,
    execute: scene => {
      if (scene.editorGuides !== previous) throw new Error('The guides changed. Start the edit again from the current scene.')
      return { ...scene, editorGuides: next }
    },
    undo: scene => {
      if (previous) return { ...scene, editorGuides: previous }
      const { editorGuides: _discard, ...rest } = scene
      return rest
    },
  }
}
