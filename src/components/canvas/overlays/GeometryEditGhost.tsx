import { useMemo, useRef } from 'react'
import type { Layer } from '@/lib/types'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { pathToSvgString } from '@/lib/geometry/PathCommand'
import { splineToPathDefinition } from '@/lib/spline/splineToPath'
import { mesh2DBoundaryPath } from '@/lib/geometry/mesh2d'
import { AnchorHandle } from './AnchorHandle'

/** Convert borrowed rendered geometry into a local outline, never a scene copy. */
function outline(layer: Layer): string {
  if (layer.spline) return pathToSvgString(splineToPathDefinition(layer.spline))
  const mesh = layer.mesh2d
  return mesh?.boundaryRings ? pathToSvgString(mesh2DBoundaryPath(mesh.boundaryRings, mesh.geometry.positions)) : ''
}

/** Edit-session-only original silhouette and fixed origin. Mount on entry and
 * unmount on exit; document/layer changes replace the snapshot. Only one
 * boundary string, matrix and pivot are retained, never a source scene or GPU
 * resource. Zoom is applied at display time; this overlay never enters exports.
 * Mesh live outlines remain orange while the original is dashed/translucent. */
export function GeometryEditGhost({ layer, worldMatrix, zoom, document, visible = true }: {
  layer: Layer; worldMatrix: Matrix2D; zoom: number; document: AbortSignal; visible?: boolean
}) {
  const current = useMemo(() => outline(layer), [layer.spline, layer.mesh2d?.geometry, layer.mesh2d?.boundaryRings])
  const snapshot = useRef<{ id: string; type: string; document: AbortSignal;
    path: string; matrix: Matrix2D; origin: { x: number; y: number } }>()
  if (!snapshot.current || snapshot.current.id !== layer.id || snapshot.current.type !== layer.type
    || snapshot.current.document !== document) {
    snapshot.current = { id: layer.id, type: layer.type, document, path: current, matrix: worldMatrix,
      origin: worldMatrix.applyToPoint({ x: layer.transform.anchorX, y: layer.transform.anchorY }) }
  }
  const original = snapshot.current
  // Playback/preview can hide chrome without ending the source Edit session.
  if (!visible) return null
  const screenMatrix = (matrix: Matrix2D) => `matrix(${matrix.toArray().map(value => value * zoom).join(' ')})`
  return <>
    <svg role="img" aria-label="Original geometry ghost" className="absolute inset-0 z-20 overflow-visible pointer-events-none">
      <path data-edit-ghost d={original.path} transform={screenMatrix(original.matrix)}
        fill={layer.type === 'mesh2d' ? '#94a3b8' : 'none'} fillOpacity={.12} fillRule="evenodd"
        stroke="#64748b" strokeOpacity={.65} strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
      {layer.mesh2d && <path data-mesh-edit-boundary d={current} transform={screenMatrix(worldMatrix)} fill="none"
        stroke="#FDBA74" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
    </svg>
    <AnchorHandle x={original.origin.x * zoom} y={original.origin.y * zoom} label="Fixed Edit origin" />
  </>
}
