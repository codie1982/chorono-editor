import type { PathBounds } from '@/lib/geometry/computePathBounds'

/** Transient geometry boundary for the in-progress shape, including the work
 * area outside the clipped composition. Borrows composition-pixel bounds from
 * the existing geometry resolver; CSS zoom maps them into the artboard wrapper.
 * Pointer-transparent editor chrome only: no scene/history/export ownership. */
export function ShapePlacementOutline({ bounds, zoom, width, height }: {
  bounds: PathBounds | null; zoom: number; width: number; height: number
}) {
  if (!bounds) return null
  return <svg data-shape-placement-outline className="absolute inset-0 z-10 pointer-events-none"
    width={width * zoom} height={height * zoom} style={{ overflow: 'visible' }} aria-hidden="true">
    <rect x={bounds.x * zoom} y={bounds.y * zoom} width={Math.max(1, bounds.width * zoom)} height={Math.max(1, bounds.height * zoom)}
      fill="none" stroke="#93c5fd" strokeWidth={1} strokeDasharray="4 3" />
  </svg>
}
