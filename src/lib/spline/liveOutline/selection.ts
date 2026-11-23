import type { SplinePathData } from '../../types/spline'
import type { SplineEditMode } from '../selection/state'
import { bandSelection } from '../band/selection'

/** Stable whole-Object source scope. A native Edge selection is admitted only
 * if every contour/edge of each touched Object is selected. Partial-chain live
 * topology remapping is deliberately unavailable, never silently promoted. */
export function liveOutlineSelection(data: SplinePathData, mode: SplineEditMode, ids: readonly string[]) {
  const chains = bandSelection(data, mode, ids), objectIds = Array.from(new Set(chains.map(chain => chain.objectId)))
  if (mode === 'edge') {
    const selected = new Set(ids)
    if (objectIds.some(id => data.subShapes[id].contourIds.some(c => data.contours[c].segmentIds.some(edge => !selected.has(edge)))))
      throw new Error('Live Outline needs all contours of each Object. Select every edge, or use Object mode; partial-chain source tracking is not available yet.')
  }
  return { chains, objectIds }
}
