import type { ChronoScene } from '../../types'
import { assertSceneGuides } from '../../geometry/guides/sceneGuideData'

/** Shared recognition for an editable scene source. Merge keeps the historical
 * 1.x/layers/composition minimum; complete document opening additionally requires
 * the arrays consumed unconditionally by editor hooks. This is structural
 * recognition, not deep layer/topology/security validation or normalization. */
export function isChoronoScene(value: unknown, complete = false): value is ChronoScene {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const scene = value as Record<string, unknown>
  if (typeof scene.formatVersion !== 'string' || !scene.formatVersion.startsWith('1.') || !Array.isArray(scene.layers)
    || !scene.composition || typeof scene.composition !== 'object' || Array.isArray(scene.composition)) return false
  return !complete || ['assets', 'timelines', 'parameters', 'bindings', 'triggers'].every(key => Array.isArray(scene[key]))
}

/** Convert decoded JSON to a scene without cloning, changing IDs, normalizing
 * URLs, or dropping unknown serializable fields. Syntax errors remain SyntaxError;
 * wrong version/structure throws a descriptive Error. Byte/text limits and source
 * lifetime belong to the reader. Parsed object memory is platform-managed and
 * not represented by the text reservation. MCP has stricter protocol limits and
 * deep validation; that protocol migration is intentionally outside this change. */
export function parseSceneJson(text: string, complete = false): ChronoScene {
  const scene: unknown = JSON.parse(text)
  if (!isChoronoScene(scene, complete)) throw new Error(complete
    ? 'Not a complete Chorono scene: expected version 1.x, composition, layers, assets, timelines, parameters, bindings and triggers.'
    : 'Not a valid Chorono scene: expected version 1.x, a composition object and a layers array.')
  assertSceneGuides(scene.editorGuides)
  return scene
}
