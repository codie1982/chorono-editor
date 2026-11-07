export const MIN_TIMELINE_ZOOM = 0.25
export const MAX_TIMELINE_ZOOM = 20

export function clampTimelineZoom(zoom: number): number {
  return Number.isFinite(zoom) ? Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, zoom)) : 1
}

export function clampTimelineScroll(scroll: number, trackWidth: number, zoom: number): number {
  const max = Math.max(0, trackWidth * clampTimelineZoom(zoom) - trackWidth)
  return Number.isFinite(scroll) ? Math.max(0, Math.min(max, scroll)) : 0
}
