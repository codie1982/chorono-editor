// ── Effects barrel + bootstrap ────────────────────────────────────────────────

export { EffectRegistry, effectRegistry } from './EffectRegistry'
export type { EffectPlugin, EffectDefinition } from './EffectRegistry'

export { blurEffect }         from './BlurEffect'
export { glowEffect }         from './GlowEffect'
export { shadowEffect }       from './ShadowEffect'
export { innerShadowEffect }  from './InnerShadowEffect'
export { innerGlowEffect }    from './InnerGlowEffect'
export { tintEffect }         from './TintEffect'
export { vignetteEffect }     from './VignetteEffect'

export type { BlurEffectDefinition        } from './BlurEffect'
export type { GlowEffectDefinition        } from './GlowEffect'
export type { ShadowEffectDefinition      } from './ShadowEffect'
export type { InnerShadowEffectDefinition } from './InnerShadowEffect'
export type { InnerGlowEffectDefinition   } from './InnerGlowEffect'
export type { TintEffectDefinition        } from './TintEffect'
export type { VignetteEffectDefinition    } from './VignetteEffect'

// Auto-register built-in effects.
import { effectRegistry }    from './EffectRegistry'
import { blurEffect }        from './BlurEffect'
import { glowEffect }        from './GlowEffect'
import { shadowEffect }      from './ShadowEffect'
import { innerShadowEffect } from './InnerShadowEffect'
import { innerGlowEffect }   from './InnerGlowEffect'
import { tintEffect }        from './TintEffect'
import { vignetteEffect }    from './VignetteEffect'

let bootstrapped = false
export function bootstrapEffects(): void {
  if (bootstrapped) return
  bootstrapped = true
  effectRegistry.register(blurEffect)
  effectRegistry.register(glowEffect)
  effectRegistry.register(shadowEffect)
  effectRegistry.register(innerShadowEffect)
  effectRegistry.register(innerGlowEffect)
  effectRegistry.register(tintEffect)
  effectRegistry.register(vignetteEffect)
}

bootstrapEffects()
