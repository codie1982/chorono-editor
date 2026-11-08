import type { Layer } from '../../types'

/** Inclusive authored-ms gate, without root-only solo/mask classification. */
export function layerDrawActive(layer: Layer, timeMs: number): boolean {
  return !layer.hidden && timeMs >= (layer.startMs ?? 0) && (layer.endMs === undefined || timeMs <= layer.endMs)
}

/** Authored inclusive composition-ms visibility gate shared by drawing and media
 * preparation. Solo applies to roots only, matching the existing renderer. Mask
 * sources and motion guides are omitted standalone but remain reference data. */
export class LayerDrawVisibility {
  private readonly solo: boolean
  private readonly masks = new Set<string>()
  /** One current evaluated layer array; no references to earlier frames. */
  constructor(layers: readonly Layer[], private readonly timeMs: number) {
    this.solo = layers.some(layer => layer.type !== 'audio' && layer.solo)
    layers.forEach(layer => layer.masks?.forEach(mask => this.masks.add(mask.maskLayerId)))
  }
  /** Nested source/group dispatch deliberately does not apply root solo filtering. */
  active(layer: Layer): boolean {
    return layerDrawActive(layer, this.timeMs)
  }
  /** Root walk only; explicit mask references bypass this gate. */
  root(layer: Layer): boolean {
    return this.active(layer) && (!this.solo || !!layer.solo) && !this.masks.has(layer.id)
      && !(layer.type === 'path' && layer.pathRole === 'motion')
  }
}
