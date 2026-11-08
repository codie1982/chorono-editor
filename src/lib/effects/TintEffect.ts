// ── TintEffect ────────────────────────────────────────────────────────────────
//
// Recolours the layer with a solid colour, optionally blended with the
// original at a configurable strength. Three blend modes covering the
// common cases:
//   - 'multiply' → darkens the layer with the tint colour (warm/cool grade)
//   - 'screen'   → lightens (use for highlights)
//   - 'overlay'  → contrast-aware mix (default)
//
// Useful for applying brand colours to imported greyscale icons, hover
// states, "selected" UI tinting, etc.

import type { EffectPlugin, EffectDefinition } from './EffectRegistry'
import { withEffectSurfaces } from './withEffectSurfaces'

export interface TintEffectDefinition extends EffectDefinition {
  type: 'tint'
  params: {
    color:    string
    strength: number   // 0 = original, 1 = full tint
    blend:    'multiply' | 'screen' | 'overlay' | 'color'
  }
}

export const tintEffect: EffectPlugin<TintEffectDefinition> = {
  type: 'tint',
  alphaSafe: true,
  regionPadding: () => 0,
  apply: withEffectSurfaces<TintEffectDefinition>((input, effect, surfaces) => {
    const { color = '#3B82F6', strength = 0.5, blend = 'overlay' } = effect.params
    const W = input.width
    const H = input.height

    // Build a tinted clone of the input
    const tint = surfaces.create(W, H)
    const tctx = tint.getContext('2d')!
    tctx.drawImage(input, 0, 0)
    tctx.globalCompositeOperation = 'source-in'   // keep alpha, replace colour
    tctx.fillStyle = color
    tctx.fillRect(0, 0, W, H)
    tctx.globalCompositeOperation = 'source-over'

    // Composite original + tinted with the chosen blend mode + strength
    const out  = surfaces.create(W, H)
    const octx = out.getContext('2d')!
    octx.drawImage(input, 0, 0)
    octx.globalAlpha = Math.max(0, Math.min(1, strength))
    octx.globalCompositeOperation = blend as GlobalCompositeOperation
    octx.drawImage(tint, 0, 0)
    octx.globalAlpha = 1
    octx.globalCompositeOperation = 'source-over'
    return out
  }),
}
