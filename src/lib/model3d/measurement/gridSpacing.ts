import type { ModelViewCamera } from '../inspection/types'

/** Largest 1–2–5 factor no greater than the requested positive span. The
 * caller supplies a bounded, dimensionless ratio; this never edits scene data. */
export function gridStep(requested: number): number {
  const power = 10 ** Math.floor(Math.log10(requested))
  const unit = requested / power
  return (unit >= 5 ? 5 : unit >= 2 ? 2 : 1) * power
}

/** Approximate horizontal world span in metres at the camera target plane.
 * Perspective foreshortening changes screen square width, not this value. */
export function visibleGridSpan(view: ModelViewCamera, width: number, height: number): number {
  const aspect = width / height
  return view.projection === 'orthographic' ? view.orthoHeight * Math.max(1, aspect)
    : view.distance * Math.tan(view.fov * Math.PI / 360) * Math.max(1, aspect) * 2
}

/** Display-only ladder with a physical floor at baseMeters. Snap and source
 * measurements use baseMeters even when distant lines are thinned. */
export function visibleGridStep(view: ModelViewCamera, width: number, height: number, baseMeters: number): number {
  return baseMeters * gridStep(Math.max(1, visibleGridSpan(view, width, height) / (8 * baseMeters)))
}
