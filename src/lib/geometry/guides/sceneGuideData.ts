import type { SceneGuide, SceneGuideData } from './SceneGuide'

export const MAX_SCENE_GUIDES = 1000
export const MAX_GUIDE_POSITION = 10_000_000

/** Validate optional persisted authoring data before opening/mutating it. Old
 * scenes may omit the payload. Unsupported versions, duplicate IDs, nonfinite
 * coordinates and oversized lists produce a diagnostic, never silent coercion. */
export function assertSceneGuides(value: unknown): asserts value is SceneGuideData | undefined {
  if (value === undefined) return
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid editor guides payload.')
  const data = value as SceneGuideData
  if (data.version !== 1 || !Array.isArray(data.guides) || data.guides.length > MAX_SCENE_GUIDES) throw new Error('Unsupported or oversized editor guides payload.')
  const ids = new Set<string>()
  for (const guide of data.guides) {
    if (!guide || typeof guide.id !== 'string' || !/^[\w-]{1,128}$/.test(guide.id) || ids.has(guide.id)
      || !['v', 'h'].includes(guide.axis) || !Number.isFinite(guide.position) || Math.abs(guide.position) > MAX_GUIDE_POSITION
      || (guide.locked !== undefined && typeof guide.locked !== 'boolean')
      || (guide.hidden !== undefined && typeof guide.hidden !== 'boolean')) throw new Error('Invalid or duplicate editor guide.')
    ids.add(guide.id)
  }
}

/** Read without throwing from rendering/snap adapters that may receive an
 * unvalidated external scene. Return a diagnostic alongside an empty list;
 * callers display it rather than crashing or snapping to malformed coordinates. */
export function readSceneGuides(scene: { editorGuides?: SceneGuideData }): { guides: readonly SceneGuide[]; error?: string } {
  try { assertSceneGuides(scene.editorGuides); return { guides: scene.editorGuides?.guides ?? [] } }
  catch (error) { return { guides: [], error: error instanceof Error ? error.message : String(error) } }
}
