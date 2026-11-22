'use client'
import type { Layer } from '@/lib/types'
import type { Matrix2D } from '@/lib/geometry/Matrix2D'
import { pathToSvgString } from '@/lib/geometry'
import { splineToPathDefinition } from '@/lib/spline'
import { subShapeData, splineEdgePath, type SplinePick } from '@/lib/spline/selection'
import type { SplineEditController } from './splineEdit/useSplineEditSelection'

/** Legacy hover records remain accepted by standalone callers. */
export type SplineHoverTarget = { kind: 'point'; id: string } | { kind: 'handle'; pointId: string; handleKind: 'in' | 'out' }
  | { kind: 'segment'; id: string } | null
interface Props {
  layer: Layer; zoom: number; worldMatrix: Matrix2D
  hover?: SplinePick | SplineHoverTarget
  selectedPointId?: string | null
  selection?: SplineEditController
}
/** Read-only sub-object overlay. World affine + zoom are applied once to paths;
 * node/handle radii and stroke widths stay in CSS pixels. Only the active mode's
 * affordances are drawn. Object paths include every contour/hole of that
 * SubShape. Pointer events remain off; the shared canvas interaction owner
 * performs mode-specific picking and gestures. Nothing is serialized/exported. */
export default function SplineEditOverlay({ layer, zoom, worldMatrix, hover = null, selectedPointId = null, selection }: Props) {
  if (layer.type !== 'spline' || !layer.spline) return null
  const data = layer.spline, mode = selection?.mode ?? 'point'
  const ids = selection?.ids ?? (selectedPointId ? [selectedPointId] : [])
  const toScreen = (point: { x: number; y: number }) => { const world = worldMatrix.applyToPoint(point); return { x: world.x * zoom, y: world.y * zoom } }
  const a = worldMatrix.applyToPoint({ x: 0, y: 0 }), x = worldMatrix.applyToVector({ x: 1, y: 0 }), y = worldMatrix.applyToVector({ x: 0, y: 1 })
  const matrix = `matrix(${x.x * zoom} ${x.y * zoom} ${y.x * zoom} ${y.y * zoom} ${a.x * zoom} ${a.y * zoom})`
  const handles = new Map(Object.values(data.handles).map(handle => [`${handle.pointId}:${handle.kind}`, handle]))
  return <svg aria-label={`Spline ${mode} selection`} className="absolute inset-0 z-30 overflow-visible pointer-events-none" style={{ width: '100%', height: '100%' }}>
    {mode === 'object' && <g transform={matrix}>{Object.values(data.subShapes).map(object => {
      const selected = ids.includes(object.id), hovered = hover?.kind === 'object' && hover.id === object.id
      const d = pathToSvgString(splineToPathDefinition(subShapeData(data, object.id)))
      return <g key={object.id}>{(selected || hovered) && <path d={d} fill="none" stroke="#FFFFFF" strokeWidth={4.5} vectorEffect="non-scaling-stroke" />}
      <path data-spline-object-id={object.id} data-selected={selected} d={d}
        fill="none" stroke={hovered ? '#F59E0B' : selected ? '#2563EB' : '#94A3B8'} strokeWidth={selected || hovered ? 2.5 : 1}
        vectorEffect="non-scaling-stroke" strokeDasharray={selected ? undefined : '4 3'} /></g>
    })}</g>}
    {mode === 'edge' && <g transform={matrix}>{Object.keys(data.segments).map(id => {
      const selected = ids.includes(id), hovered = (hover?.kind === 'edge' || hover?.kind === 'segment') && hover.id === id
      const d = pathToSvgString(splineEdgePath(data, id))
      return <g key={id}>{(selected || hovered) && <path d={d} fill="none" stroke="#FFFFFF" strokeWidth={5} vectorEffect="non-scaling-stroke" />}
      <path data-spline-edge-id={id} data-selected={selected} d={d} fill="none"
        stroke={hovered ? '#F59E0B' : selected ? '#2563EB' : '#94A3B8'} strokeWidth={selected || hovered ? 3 : 1} vectorEffect="non-scaling-stroke" /></g>
    })}</g>}
    {mode === 'point' && Object.values(data.points).map(point => {
      const screen = toScreen(point), selected = ids.includes(point.id), hovered = hover?.kind === 'point' && hover.id === point.id
      return <g key={point.id} data-spline-point-id={point.id} data-selected={selected}>
        {(['in', 'out'] as const).map(kind => {
          const handle = handles.get(`${point.id}:${kind}`)
          if (!handle) return null
          const end = toScreen(handle), active = hover?.kind === 'handle' && hover.pointId === point.id && hover.handleKind === kind
          return <g key={kind}><line x1={screen.x} y1={screen.y} x2={end.x} y2={end.y} stroke="#60A5FA" strokeWidth={1} strokeDasharray="2 2" opacity={.7} />
            <circle cx={end.x} cy={end.y} r={active ? 5 : 3.5} fill={active ? '#F59E0B' : '#60A5FA'} stroke="#1E3A8A" /></g>
        })}
        <rect x={screen.x - (selected || hovered ? 4.5 : 3.5)} y={screen.y - (selected || hovered ? 4.5 : 3.5)}
          width={selected || hovered ? 9 : 7} height={selected || hovered ? 9 : 7}
          fill={hovered ? '#F59E0B' : selected ? '#2563EB' : point.type === 'corner' ? '#FFFFFF' : '#DBEAFE'} stroke={selected ? '#FFFFFF' : '#1F2937'} strokeWidth={selected ? 1.5 : 1} />
      </g>
    })}
  </svg>
}
