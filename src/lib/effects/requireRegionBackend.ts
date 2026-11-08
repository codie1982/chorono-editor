import { SurfaceRegionFallback, type CanvasSurfaceAllocator } from '@/lib/render/resources/CanvasSurfaceScope'

/** Native CSS blur can change rounding with canvas extent. Never silently
 * switch a cropped Gaussian pass to CSS after GPU loss: abort partial work and
 * let the owning pipeline retry the full-domain legacy path exactly once. */
export function requireRegionBackend(surfaces: CanvasSurfaceAllocator, gpu: HTMLCanvasElement | null, radius: number): void {
  if (surfaces.cropped && radius > 0 && !gpu) throw new SurfaceRegionFallback('Cropped blur backend unavailable.')
}
