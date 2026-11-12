import type { Matrix2D } from '@/lib/geometry/Matrix2D'
import { HANDLE_CURSORS, type Handle } from '../types/canvasDragTypes'

interface Props {
  width: number
  height: number
  zoom: number
  worldMatrix: Matrix2D
  /** Entire frame uses dashes when its geometry crosses the composition edge. */
  dashed?: boolean
  onHandlePointerDown?: (handle: Handle) => (event: React.PointerEvent) => void
  onRotatePointerDown?: (event: React.PointerEvent) => void
}

/** Draw a sized layer's actual affine quadrilateral, including its complete
 * parent chain. Geometry is projected to screen pixels; handles keep constant
 * CSS-pixel hit sizes even through reflection/nonuniform scale. Source geometry
 * and renderer state are borrowed and never changed by this visual adapter. */
export function AffineSelectionFrame({ width, height, zoom, worldMatrix,
  onHandlePointerDown, onRotatePointerDown, dashed }: Props) {
  const at = (x: number, y: number) => {
    const point = worldMatrix.applyToPoint({ x, y })
    return { x: point.x * zoom, y: point.y * zoom }
  }
  const points = [at(0, 0), at(width, 0), at(width, height), at(0, height)]
  const handles: { id: Handle; x: number; y: number }[] = [
    { id: 'nw', ...points[0] }, { id: 'n', ...at(width / 2, 0) },
    { id: 'ne', ...points[1] }, { id: 'e', ...at(width, height / 2) },
    { id: 'se', ...points[2] }, { id: 's', ...at(width / 2, height) },
    { id: 'sw', ...points[3] }, { id: 'w', ...at(0, height / 2) },
  ]
  const center = at(width / 2, height / 2)
  return <div data-testid="selection-frame" data-selection-points={JSON.stringify(points)}
    className="absolute inset-0 pointer-events-none">
    <svg className="absolute inset-0 w-full h-full overflow-visible" aria-hidden="true">
      <polygon points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#0f172a" strokeWidth={4} strokeOpacity={0.65} strokeDasharray={dashed ? '5 4' : undefined} />
      <polygon points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#60a5fa" strokeWidth={2} strokeDasharray={dashed ? '5 4' : undefined} />
    </svg>
    {onRotatePointerDown && points.map((point, index) => {
      const length = Math.hypot(point.x - center.x, point.y - center.y) || 1
      const x = point.x + (point.x - center.x) / length * 16
      const y = point.y + (point.y - center.y) / length * 16
      return <div key={`rotate-${index}`} title="Drag to rotate (Shift = snap 15°)"
        onPointerDown={onRotatePointerDown}
        className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 pointer-events-auto grid place-items-center cursor-alias"
        style={{ left: x, top: y }}><span className="h-2 w-2 rounded-full bg-white border border-blue-500 shadow" /></div>
    })}
    {onHandlePointerDown && handles.map(handle => <div key={handle.id}
      title={`Resize ${handle.id}`} data-handle={handle.id}
      onPointerDown={onHandlePointerDown(handle.id)}
      className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 pointer-events-auto grid place-items-center"
      style={{ left: handle.x, top: handle.y, cursor: HANDLE_CURSORS[handle.id] }}>
      <span className="h-3 w-3 rounded-sm border border-blue-600 bg-white shadow" />
    </div>)}
  </div>
}
