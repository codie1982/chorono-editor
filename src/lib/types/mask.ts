// ── Mask Types ────────────────────────────────────────────────────────────────
//
// A MaskDefinition attaches another layer's silhouette as an alpha cutout on
// the host layer. The mask layer is rendered into an offscreen canvas and
// composited with the host content via Canvas globalCompositeOperation.

export type MaskMode = 'add' | 'subtract' | 'intersect'

export interface MaskDefinition {
  id: string
  /** Layer id whose rendered silhouette is the mask shape. */
  maskLayerId: string
  /**
   * 'add'       → include any pixel touched by the mask (default)
   * 'subtract'  → exclude pixels touched by the mask
   * 'intersect' → keep only pixels touched by EVERY mask
   */
  mode: MaskMode
  /** Invert the mask (alpha 0 ↔ 1) before compositing. */
  inverted?: boolean
  /** Feather radius in px (gaussian blur on the mask). */
  feather?: number
  /** Mask opacity 0–1. Default 1. */
  opacity?: number
}
