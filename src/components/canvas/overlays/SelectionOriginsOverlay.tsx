import { useMemo } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import { createLayerWorldMatrixResolver } from '@/lib/geometry/resolveLayerWorldMatrix'
import { AnchorHandle } from './AnchorHandle'

/** Draw each selected object's authored origin through its displayed world
 * matrix, including animated parents and reflected transforms. Positions use
 * composition pixels; zoom affects placement, never the CSS marker size.
 * Only editor chrome is returned; source/history are borrowed and unmodified.
 */
export function SelectionOriginsOverlay({ scene, selectedIds, timeMs, overrides, zoom }: {
  scene: ChronoScene; selectedIds: ReadonlySet<string>; timeMs: number; overrides: OverrideMap; zoom: number
}) {
  const origins = useMemo(() => {
    const matrixFor = createLayerWorldMatrixResolver(scene, timeMs, overrides)
    return scene.layers.filter(layer => selectedIds.has(layer.id) && !layer.hidden).map(layer => ({
      id: layer.id, name: layer.name,
      point: matrixFor(layer).applyToPoint({ x: layer.transform.anchorX, y: layer.transform.anchorY }),
    }))
  }, [scene, selectedIds, timeMs, overrides])
  return <>{origins.map(origin => <AnchorHandle key={origin.id} x={origin.point.x * zoom} y={origin.point.y * zoom}
    label={`${origin.name} origin`} />)}</>
}
