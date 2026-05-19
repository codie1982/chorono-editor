// ── Particle Rendering Types ───────────────────────────────────────────────────

export type ParticleBlendMode = 'normal' | 'screen' | 'additive' | 'multiply'

export interface ParticleGlowConfig {
  enabled:   boolean
  radius:    number
  intensity: number
}

export interface ParticleBlurConfig {
  enabled: boolean
  radius:  number
}

export interface ParticleRenderingConfig {
  blendMode: ParticleBlendMode
  softEdges: boolean
  glow?:     ParticleGlowConfig
  blur?:     ParticleBlurConfig
  /**
   * 'low'    → skip glow/blur; pixel-level simplifications
   * 'medium' → glow allowed, blur skipped
   * 'high'   → all effects enabled
   */
  quality:   'low' | 'medium' | 'high'
}
