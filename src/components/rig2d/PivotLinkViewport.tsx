'use client'
import { useMemo, useState, type MouseEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { hitTestLayersAt, type HitTestOptions } from '@/lib/renderer'
import type { OverrideMap } from '@/lib/evaluator'
import type { ChronoScene } from '@/lib/types'
import type { Vec2 } from '@/lib/geometry/CoordinateSystem'
import { CanvasSelectionEligibility } from '@/lib/selection/CanvasSelectionEligibility'
import { acceptsPivotPick, pickPrompt, type PivotPicking } from './usePivotPicking'
import { EMPTY_IK_DIAGNOSTICS, type IKDiagnostics } from '@/lib/rig2d/diagnostics'
import { IKReachGuide } from './IKReachGuide'
import { selectedPivotRelations, viewportPivots } from './pivotViewport'

/** Place graphics in CSS pixels to keep dashes, endpoints and arrowheads
 * legible while zooming. Coincident pivots get a small directed loop. */
function Connection({ from, to, label }: { from: Vec2; to: Vec2; label: string }) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI
  const loop = distance < 12
  const shaft = loop ? 'M 0 0 C -18 -5 -13 -25 1 -20 Q 16 -15 5 -5' : 'M 0 0 H ' + distance
  const head = loop ? 'translate(5 -5) rotate(130)' : 'translate(' + Math.max(5, distance - 8) + ' 0)'
  return <g aria-label={label} data-relation="link" transform={`translate(${from.x} ${from.y}) rotate(${loop ? 0 : angle})`}>
    <title>{label}</title>
    <path d={shaft} fill="none" stroke="#222825" strokeWidth="3.5" strokeDasharray="6 4" />
    <path d={shaft} fill="none" stroke="#ffad7d" strokeWidth="1.7" strokeDasharray="6 4" />
    <circle r="3.5" fill="#ffad7d" stroke="#202523" strokeWidth="1.2" />
    <path transform={head} d="M 4 0 L -5 -4 L -5 4 Z" fill="#ffad7d" stroke="#202523" strokeWidth="1.2" />
  </g>
}

interface Props {
  scene: ChronoScene
  selection: ReadonlySet<string>
  overrides: OverrideMap
  timeMs: number
  zoom: number
  diagnostics?: IKDiagnostics
  picking?: PivotPicking
  canvasRef: RefObject<HTMLCanvasElement>
  viewportRef: RefObject<HTMLDivElement>
  hitOptions: HitTestOptions
}

/** Render editor-only relationship guides in the artboard coordinate system.
 * A temporary viewport-wide pointer surface owns picks above transform handles,
 * including off-artboard objects. Normal overlay graphics never intercept input. */
export function PivotLinkViewport({ scene, selection, overrides, timeMs, zoom, diagnostics = EMPTY_IK_DIAGNOSTICS, picking, canvasRef, viewportRef, hitOptions }: Props) {
  const pick = picking?.pick
  const relations = useMemo(() => selectedPivotRelations(scene.layers, selection), [scene.layers, selection])
  const visible = !!pick || relations.length > 0
  const pivot = useMemo(() => visible ? viewportPivots(scene, timeMs, overrides) : null, [visible, scene, timeMs, overrides])
  const byId = useMemo(() => visible ? new Map(scene.layers.map(item => [item.id, item])) : null, [scene.layers, visible])
  const [pointer, setPointer] = useState<Vec2 | null>(null)
  const candidates = useMemo(() => {
    const owner = pick && byId?.get(pick.ownerId)
    if (!pick || !owner) return []
    const eligibility = new CanvasSelectionEligibility(scene.layers, timeMs, overrides)
    return scene.layers.filter(item => acceptsPivotPick(pick, owner, item) && eligibility.accepts(item))
  }, [byId, pick, scene.layers, overrides, timeMs])
  const groupPivots = useMemo(() => candidates.filter(item => item.type === 'group').flatMap(item => {
    const point = pivot?.(item.id)
    return point ? [{ id: item.id, name: item.name, point }] : []
  }), [candidates, pivot])
  if (!pivot || !byId) return null
  const scaled = (point: Vec2) => ({ x: point.x * zoom, y: point.y * zoom })
  const cursorPoint = (event: MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: (event.clientX - rect.left) * scene.composition.width / rect.width,
      y: (event.clientY - rect.top) * scene.composition.height / rect.height }
  }
  const choose = (event: MouseEvent) => {
    event.preventDefault(); event.stopPropagation()
    if (!pick || !canvasRef.current) return
    const point = cursorPoint(event)
    const group = groupPivots.slice().reverse().find(({ point: p }) => Math.hypot(p.x-point.x,p.y-point.y) * zoom <= 7)
    const allowed = new Set(candidates.map(item => item.id))
    const hit = group?.id ?? hitTestLayersAt(scene, timeMs, point.x, point.y, overrides, hitOptions).find(id => allowed.has(id))
    setPointer(null)
    picking?.choose(hit ?? null)
  }
  const start = pick && pivot(pick.step === 'target' ? pick.lowerId : pick.ownerId)
  return <>
    <svg aria-label="Layer connections" className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible">
      {relations.map(({ from, to, kind }) => {
        const a = pivot(from), b = pivot(to)
        if (!a || !b) return null
        const label = byId.get(from)!.name + (kind === 'link' ? ' follows ' : ' aims at ') + byId.get(to)!.name
        if (kind === 'ik') {
          const upperId = byId.get(from)?.pivotLink2d?.driverId
          const chain = upperId && diagnostics.get(upperId)
          if (!chain || chain.status === 'inactive' || !pivot(chain.upperId)) return null
          return <IKReachGuide key={chain.upperId} chain={chain} ik={byId.get(chain.upperId)?.twoBoneIK2d} zoom={zoom} label={label} />
        }
        return <Connection key={kind+from} from={scaled(a)} to={scaled(b)} label={label} />
      })}
      {pick && groupPivots.map(({ id, name, point }) => <circle key={id} cx={point.x*zoom} cy={point.y*zoom} r="5" fill="#242923" stroke="#ffad7d"><title>{name}</title></circle>)}
      {start && pointer && <line x1={start.x*zoom} y1={start.y*zoom} x2={pointer.x*zoom} y2={pointer.y*zoom} stroke="#e77847" strokeWidth="2" strokeDasharray="5 4" />}
    </svg>
    {pick && picking && viewportRef.current && createPortal(<div data-testid="pivot-pick-surface" className="absolute inset-0 z-50 cursor-crosshair touch-none"
      onPointerDown={e => { if (e.button !== 1) e.stopPropagation() }}
      onPointerMove={e => { if (canvasRef.current) setPointer(cursorPoint(e)) }}
      onPointerLeave={() => setPointer(null)} onClick={choose}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setPointer(null); picking.cancel() }}>
      <span role="status" className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-orange-400/70 bg-gray-950/95 px-3 py-1.5 text-xs text-orange-100">
        {pickPrompt[pick.step]} · Esc to cancel
      </span>
    </div>, viewportRef.current)}
  </>
}
