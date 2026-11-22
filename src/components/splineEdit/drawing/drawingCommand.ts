import type { ChronoScene } from '@/lib/types'
import type { SplinePathData } from '@/lib/types/spline'
import type { OverrideMap } from '@/lib/evaluator'
import { placeSplineInLayer, extendSplineContour, appendSplineObjects } from '@/lib/spline'
import { newSplineLayerFromData } from '@/lib/defaults'
import { makeAddLayerCmd } from '@/lib/editor/commands-layer'
import { splineEditCommand } from '../commands'
import { connectSplineEndpoints } from '@/lib/spline/topology'

export interface SplineDrawResult { layerId: string; mode: 'point' | 'object'; ids: string[] }
/** Prepare one native drawing command. New layers and appended objects use the
 * same normalized geometry. Continue and vertex-acquired joins preserve IDs/curves;
 * append preserves the target's complete style/outer animation. World points
 * are converted through the displayed full parent inverse. Throws on unavailable,
 * driven or singular targets before any source/history change. With an optional
 * joinEndpointId the incoming contour contains start + intermediate points ONLY;
 * the reached existing endpoint is connected by ID, never appended as a clone.
 * Joins use existing single-contour Object/lock/reference safety contracts. */
export function splineDrawingCommand(scene: ChronoScene, targetId: string | null, data: SplinePathData,
  position: { x: number; y: number }, openPath: boolean, name: string, timeMs: number, overrides?: OverrideMap,
  endpointId?: string, closed = false, joinEndpointId?: string) {
  if (joinEndpointId && (!endpointId || !targetId)) throw new Error('A drawn connection must start at an existing endpoint in the edited spline.')
  if (!targetId) {
    const layer = newSplineLayerFromData(data, { name, openPath, ...position })
    return { command: makeAddLayerCmd(layer), result: { layerId: layer.id, mode: 'object', ids: Object.keys(data.subShapes) } as SplineDrawResult }
  }
  const target = scene.layers.find(layer => layer.id === targetId)
  if (target?.type !== 'spline' || !target.spline) throw new Error('The target spline is unavailable.')
  const placed = placeSplineInLayer(data, position.x, position.y, target, scene, timeMs, overrides)
  if (!placed) throw new Error('This spline transform cannot be inverted. Nothing was changed.')
  let next: SplinePathData, result: SplineDrawResult
  if (endpointId) {
    const originalContour = Object.values(target.spline.contours).find(contour => contour.pointIds.includes(endpointId))
    const positions = Object.values(placed.contours)[0]?.pointIds.slice(1).map(id => placed.points[id]) ?? []
    next = extendSplineContour(target.spline, endpointId, positions, closed && !joinEndpointId)
    const contour = originalContour && next.contours[originalContour.id]
    const endpoint = contour?.pointIds[originalContour?.pointIds[0] === endpointId ? 0 : contour.pointIds.length - 1]
    if (joinEndpointId) {
      if (!endpoint || endpointId === joinEndpointId) throw new Error('Choose a different open endpoint to finish the connection.')
      next = connectSplineEndpoints(next, endpoint, joinEndpointId)
    }
    result = { layerId: targetId, mode: 'point', ids: joinEndpointId ? [joinEndpointId] : endpoint ? [endpoint] : [] }
  } else {
    const appended = appendSplineObjects(target.spline, placed)
    next = appended.data; result = { layerId: targetId, mode: 'object', ids: appended.objectIds }
  }
  return { command: splineEditCommand(scene, targetId, endpointId ? { kind: 'topology' } : { kind: 'metadata' }, () => next,
    joinEndpointId ? 'Join spline by drawing' : endpointId ? 'Continue spline' : 'Add spline object'), result }
}
