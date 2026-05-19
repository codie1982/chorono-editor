// ── Layer Effects ─────────────────────────────────────────────────────────────
// CSS-filter-equivalent effects applied per layer via ctx.filter.
// All values are animatable (see ANIMATABLE_PROPERTIES in editor.ts).

export interface LayerEffects {
  /** Gaussian blur in px. 0 = no blur. Range 0–50. */
  blur?: number
  /** Brightness percentage. 100 = normal. Range 0–200. */
  brightness?: number
  /** Contrast percentage. 100 = normal. Range 0–200. */
  contrast?: number
  /** Saturation percentage. 100 = normal. Range 0–200. */
  saturate?: number
}

/**
 * Plugin-based effect (glow, shadow, etc.). Applied AFTER the layer is
 * rendered to an offscreen canvas. See lib/effects/EffectRegistry.ts.
 */
export interface PluginEffect {
  id:      string
  type:    string
  enabled: boolean
  params:  Record<string, unknown>
}

// ── Motion Path ───────────────────────────────────────────────────────────────
// Animate a layer along an SVG cubic-bezier path.
// The path itself is NOT animatable — it is a static design decision.
// Animate position by keyframing the track 'motionPath.offset' (0→1).

export interface MotionPath {
  /** SVG path string, e.g. "M 0 0 C 100 50 200 50 300 0" */
  pathData: string
  /** When true, rotate layer to align with the path tangent direction */
  autoRotate?: boolean
}

/**
 * Follow Path binding — drives a target layer's position from a Bezier path
 * layer's geometry. Distinct from MotionPath (which uses an inline SVG path
 * string): FollowPath REFERENCES an existing path layer in the scene, so
 * editing the path updates every follower.
 */
export interface FollowPath {
  /** Id of a path-type layer in the scene. */
  pathLayerId: string
  /** 0–1 arc-length progress along the path. Animatable via the
   *  `followPath.progress` track on the timeline. `assignMotionPathToLayer`
   *  seeds 0 → 1 keyframes on assign so the motion is editable visually. */
  progress?: number
  /** Rotate the layer to face along the path tangent. */
  orientToPath?: boolean
  /** Extra rotation added on top of tangent (degrees). */
  rotationOffset?: number
  /** Perpendicular offset from the path (px). */
  perpendicularOffset?: number
}

// ── Canvas filter builder (used by renderer) ──────────────────────────────────
// Pure function — no side effects, safe to call every frame.
export function buildEffectsFilter(e?: LayerEffects): string {
  if (!e) return 'none'
  const parts: string[] = []
  if (e.blur       != null) parts.push(`blur(${e.blur}px)`)
  if (e.brightness != null) parts.push(`brightness(${e.brightness}%)`)
  if (e.contrast   != null) parts.push(`contrast(${e.contrast}%)`)
  if (e.saturate   != null) parts.push(`saturate(${e.saturate}%)`)
  return parts.length ? parts.join(' ') : 'none'
}
