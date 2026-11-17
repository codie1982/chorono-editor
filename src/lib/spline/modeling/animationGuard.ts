import type { ChronoScene } from '@/lib/types'
import type { SplinePathData } from '@/lib/types/spline'

/**
 * Reject a contour replacement if any timeline addresses records that would
 * be removed or changed. Unrelated layer and other-contour tracks are allowed.
 * The guard is read-only and must be rerun against the current scene at Apply.
 */
export function assertContourAnimationSafe(scene: ChronoScene, layerId: string, data: SplinePathData, contourId: string): void {
  const contour = data.contours[contourId]
  if (!contour) throw new Error('Spline contour no longer exists.')
  const pointIds = new Set(contour.pointIds), segmentIds = new Set(contour.segmentIds)
  const handleIds = new Set(Object.values(data.handles).filter(handle => pointIds.has(handle.pointId)).map(handle => handle.id))
  const subIds = new Set(Object.values(data.subShapes).filter(sub => sub.contourIds.includes(contourId)).map(sub => sub.id))
  const prefix = `layers.${layerId}.spline`
  for (const timeline of scene.timelines) for (const track of timeline.tracks) {
    if (track.target === prefix || track.target === `${prefix}.fillRule`) throw new Error('This spline has an animated geometry field; bake or remove that track before remodeling.')
    if (!track.target.startsWith(`${prefix}.`)) continue
    const path = track.target.slice(prefix.length + 1).split('.')
    if ((path[0] === 'points' && pointIds.has(path[1])) ||
        (path[0] === 'segments' && segmentIds.has(path[1])) ||
        (path[0] === 'handles' && handleIds.has(path[1])) ||
        (path[0] === 'contours' && path[1] === contourId) ||
        (path[0] === 'subShapes' && subIds.has(path[1]))) {
      throw new Error('Selected contour has animation tracks; bake or remove them before remodeling.')
    }
  }
}
