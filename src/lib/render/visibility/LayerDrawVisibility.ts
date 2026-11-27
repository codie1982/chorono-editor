import type { Layer } from '../../types'
import { editorSoloScope } from '../../scene/visibility/editorSoloScope'
import type { LayerIndex } from '../../scene/LayerIndex'

/** Inclusive authored-ms gate, without root-only solo/mask classification. */
export function layerDrawActive(layer: Layer, timeMs: number): boolean {
  return !layer.hidden && timeMs >= (layer.startMs ?? 0) && (layer.endMs === undefined || timeMs <= layer.endMs)
}

/** Authored inclusive composition-ms visibility shared by drawing and media.
 * Solo keeps selected subtrees and the ancestor chain needed to draw them;
 * unrelated siblings stay out. Explicit dependency draws use active() so masks
 * and repeater sources remain available outside their standalone Solo scope. */
export class LayerDrawVisibility {
  private readonly soloScope: ReadonlySet<string> | null
  private readonly masks = new Set<string>()
  /** One current evaluated layer array; no references to earlier frames. */
  constructor(layers: readonly Layer[], private readonly timeMs: number, index?: LayerIndex) {
    this.soloScope = editorSoloScope(layers, true, index)
    layers.forEach(layer => layer.masks?.forEach(mask => this.masks.add(mask.maskLayerId)))
  }
  /** Nested source/group dispatch deliberately does not apply root solo filtering. */
  active(layer: Layer): boolean {
    return layerDrawActive(layer, this.timeMs)
  }
  /** Ordinary scene traversal respects Solo, including nested group children. */
  sceneChild(layer: Layer): boolean {
    return this.active(layer) && (!this.soloScope || this.soloScope.has(layer.id))
  }
  /** Root walk only; explicit mask references bypass this gate. */
  root(layer: Layer): boolean {
    return this.sceneChild(layer) && !this.masks.has(layer.id)
      && !(layer.type === 'path' && layer.pathRole === 'motion')
  }
}
