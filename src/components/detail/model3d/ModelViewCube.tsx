'use client'
import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { ModelViewCamera } from '@/lib/model3d/inspection/types'
import { VIEW_DIRECTIONS, cameraForViewDirection, type ViewDirection } from '@/lib/model3d/inspection/viewDirections'
import { orbitCamera } from '@/lib/model3d/source/cameraGesture'
import { cameraScreenAxes } from '@/lib/model3d/inspection/cameraNavigation'
import { modelViewPreset } from '@/lib/model3d/inspection/viewPresets'

type Axis = 'x' | 'y' | 'z'
interface Face { axis: Axis; sign: -1 | 1 }
const faces: readonly Face[] = [{ axis: 'x', sign: 1 }, { axis: 'x', sign: -1 }, { axis: 'y', sign: 1 }, { axis: 'y', sign: -1 }, { axis: 'z', sign: 1 }, { axis: 'z', sign: -1 }]

/** Local cube face coordinates in the Y-up, +Z-front presentation frame. */
function facePoint(face: Face, u: number, v: number): { x: number; y: number; z: number } {
  if (face.axis === 'x') return { x: face.sign, y: v, z: u }
  if (face.axis === 'y') return { x: u, y: face.sign, z: v }
  return { x: u, y: v, z: face.sign }
}

/** Project the cube with the inspected yaw/pitch/roll camera orientation. */
function cubeProjection(camera: ModelViewCamera) {
  const yaw = camera.yaw * Math.PI / 180, pitch = camera.pitch * Math.PI / 180
  const direction = { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) }
  const { right, up } = cameraScreenAxes(camera)
  return { direction, point: (p: { x: number; y: number; z: number }) => ({
    x: (p.x * right.x + p.y * right.y + p.z * right.z) * 43,
    y: -(p.x * up.x + p.y * up.y + p.z * up.z) * 43,
  }) }
}

interface Drag { pointerId: number; x: number; y: number; start: ModelViewCamera; direction?: ViewDirection; moved: boolean }

/** SVG navigation cube over the inspection surface. Each visible face is one
 * solid polygon and one selection target; separate small corner points and
 * unobtrusive edge hit regions retain the 26 canonical directions without a
 * drawn 3×3 face grid. Pointer drag orbits with the existing camera gesture;
 * no GPU context, scene source, history entry or global listener is owned. */
export function ModelViewCube({ camera, onCamera }: { camera: ModelViewCamera; onCamera(camera: ModelViewCamera): void }) {
  const drag = useRef<Drag | null>(null), animation = useRef<number | null>(null), latestCamera = useRef(camera), latestCallback = useRef(onCamera)
  latestCamera.current = camera; latestCallback.current = onCamera
  useEffect(() => () => { if (animation.current !== null) cancelAnimationFrame(animation.current) }, [])
  const projection = cubeProjection(camera)
  const stopAnimation = () => { if (animation.current !== null) cancelAnimationFrame(animation.current); animation.current = null }
  const snap = (direction: ViewDirection) => {
    stopAnimation()
    const start = latestCamera.current, end = cameraForViewDirection(start, direction)
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { latestCallback.current(end); return }
    const began = performance.now(), duration = 180
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / duration), ease = 1 - (1 - t) ** 3
      latestCallback.current({ ...start, yaw: start.yaw + (end.yaw - start.yaw) * ease, pitch: start.pitch + (end.pitch - start.pitch) * ease,
        roll: (start.roll ?? 0) * (1 - ease) })
      animation.current = t < 1 ? requestAnimationFrame(tick) : null
    }
    animation.current = requestAnimationFrame(tick)
  }
  const onDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    stopAnimation(); event.preventDefault(); event.stopPropagation()
    const id = (event.target as Element).closest('[data-view-direction]')?.getAttribute('data-view-direction')
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, start: camera, direction: VIEW_DIRECTIONS.find(value => value.id === id), moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    const dx = event.clientX - state.x, dy = event.clientY - state.y
    if (Math.hypot(dx, dy) < 3 && !state.moved) return
    state.moved = true
    latestCallback.current(orbitCamera(state.start, dx, dy))
  }
  const onUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    onMove(event); drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!state.moved && state.direction) snap(state.direction)
  }
  const onCancel = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    latestCallback.current(drag.current.start); drag.current = null
  }
  const onKey = (event: ReactKeyboardEvent<SVGElement>, direction: ViewDirection) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault(); event.stopPropagation(); snap(direction)
  }
  const visible = faces.map(face => ({ face, depth: projection.direction[face.axis] * face.sign })).filter(item => item.depth > 0.0001).sort((a, b) => a.depth - b.depth)
  const visibleDirection = (direction: ViewDirection) => visible.some(({ face }) => direction[face.axis] === face.sign)
  const edges = VIEW_DIRECTIONS.filter(direction => [direction.x, direction.y, direction.z].filter(Boolean).length === 2 && visibleDirection(direction))
  const corners = VIEW_DIRECTIONS.filter(direction => direction.x && direction.y && direction.z && visibleDirection(direction))
  const iso = modelViewPreset(camera, 'isometric')
  const isIsometric = camera.projection === 'orthographic' && Math.abs(camera.yaw - iso.yaw) < .01 && Math.abs(camera.pitch - iso.pitch) < .01
  const compass = camera.yaw * Math.PI / 180
  const roll = (camera.roll ?? 0) * Math.PI / 180
  const compassPoint = (x: number, y: number) => ({ x: x * Math.cos(roll) - y * Math.sin(roll), y: x * Math.sin(roll) + y * Math.cos(roll) })
  return <div className="absolute top-3 right-3 z-10 w-44 rounded-lg border border-slate-500/70 bg-slate-950/85 p-1 shadow-lg select-none" aria-label="3D view navigation">
    <svg viewBox="-88 -88 176 176" className="block h-40 w-full touch-none cursor-grab active:cursor-grabbing focus-visible:outline focus-visible:outline-cyan-300" role="group" tabIndex={0}
      aria-label="View cube; click a face, edge or corner, drag to orbit, or use arrow keys"
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return
        const changes: Record<string, Partial<ModelViewCamera>> = {
          ArrowLeft: { yaw: camera.yaw - 45 }, ArrowRight: { yaw: camera.yaw + 45 },
          ArrowUp: { pitch: Math.min(90, camera.pitch + 45) }, ArrowDown: { pitch: Math.max(-90, camera.pitch - 45) },
        }
        if (changes[event.key]) { event.preventDefault(); onCamera({ ...camera, ...changes[event.key] }) }
      }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onLostPointerCapture={onCancel}>
      <circle r="75" fill="none" stroke="#64748b" strokeWidth="1.5" opacity=".8" />
      {([['N', Math.sin(compass) * 75, -Math.cos(compass) * 75], ['E', Math.cos(compass) * 75, Math.sin(compass) * 75],
        ['S', -Math.sin(compass) * 75, Math.cos(compass) * 75], ['W', -Math.cos(compass) * 75, -Math.sin(compass) * 75]] as const).map(([letter, x, y]) =>
        <text key={letter} x={compassPoint(x, y).x} y={compassPoint(x, y).y + 4} fill="#cbd5e1" fontSize="11" fontWeight="700" textAnchor="middle" pointerEvents="none">{letter}</text>)}
      {visible.map(({ face, depth }) => {
        const points = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => projection.point(facePoint(face, u, v)))
        const center = facePoint(face, 0, 0)
        const direction = VIEW_DIRECTIONS.find(item => item.x === center.x && item.y === center.y && item.z === center.z)!
        return <polygon key={`${face.axis}${face.sign}`} points={points.map(point => `${point.x},${point.y}`).join(' ')} data-view-direction={direction.id}
          role="button" tabIndex={0} aria-label={`${direction.label} view`} onKeyDown={event => onKey(event, direction)}
          fill={depth > .7 ? '#334155' : '#273548'} stroke="#94a3b8" strokeWidth=".85"
          className="cursor-pointer hover:fill-cyan-700 focus-visible:stroke-cyan-300 focus-visible:stroke-[3px] outline-none" />
      })}
      {edges.map(direction => {
        const ends = ([-1, 1] as const).map(sign => projection.point({ x: direction.x || sign, y: direction.y || sign, z: direction.z || sign }))
        return <g key={direction.id} className="group">
          <line x1={ends[0].x} y1={ends[0].y} x2={ends[1].x} y2={ends[1].y} stroke="transparent" strokeWidth="2" pointerEvents="none"
            className="group-hover:stroke-cyan-300 group-focus-within:stroke-cyan-300" />
          <line x1={ends[0].x} y1={ends[0].y} x2={ends[1].x} y2={ends[1].y} stroke="transparent" strokeWidth="10"
            data-view-direction={direction.id} role="button" tabIndex={0} aria-label={`${direction.label} view`}
            onKeyDown={event => onKey(event, direction)} className="cursor-pointer outline-none" />
        </g>
      })}
      {corners.map(direction => {
        const point = projection.point(direction)
        return <g key={direction.id} className="group">
          <circle cx={point.x} cy={point.y} r="3.5" fill="#94a3b8" stroke="#0f172a" strokeWidth=".7" pointerEvents="none"
            className="group-hover:fill-cyan-300 group-focus-within:fill-cyan-300" />
          <circle cx={point.x} cy={point.y} r="8" fill="transparent" data-view-direction={direction.id}
            role="button" tabIndex={0} aria-label={`${direction.label} view`} onKeyDown={event => onKey(event, direction)}
            className="cursor-pointer outline-none" />
        </g>
      })}
      {visible.map(({ face }) => {
        const center = projection.point(facePoint(face, 0, 0))
        const label = face.axis === 'x' ? face.sign > 0 ? 'RIGHT' : 'LEFT' : face.axis === 'y' ? face.sign > 0 ? 'TOP' : 'BOTTOM' : face.sign > 0 ? 'FRONT' : 'BACK'
        return <text key={`${face.axis}${face.sign}`} x={center.x} y={center.y + 3} textAnchor="middle" fill="#f8fafc" fontSize="9" fontWeight="700" pointerEvents="none">{label}</text>
      })}
    </svg>
    <div className="flex justify-center gap-3 text-[11px] font-bold" aria-label="Axis colors">
      <span className="text-red-400">X</span><span className="text-green-400">Y</span><span className="text-blue-400">Z</span>
    </div>
    <div className="mt-1 flex justify-center gap-1 border-t border-slate-700 pt-1" role="group" aria-label="3D projection">
      {([['perspective', 'Perspective'], ['orthographic', 'Orthographic'], ['isometric', 'Isometric']] as const).map(([preset, label]) =>
        <button key={preset} type="button" aria-label={`${label} view`} title={`${label} view`} aria-pressed={preset === 'isometric' ? isIsometric : preset === camera.projection && !isIsometric}
          className="flex h-7 min-w-8 items-center justify-center rounded border border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-cyan-300 aria-pressed:bg-sky-700"
          onClick={() => onCamera(modelViewPreset(camera, preset))}><ProjectionIcon kind={preset} /></button>)}
    </div>
  </div>
}

/** Small matching stroke icons distinguish projection without repeating labels. */
function ProjectionIcon({ kind }: { kind: 'perspective' | 'orthographic' | 'isometric' }) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
    {kind === 'perspective' ? <><path d="M3 16 6 6l10-3-3 10zM6 6l7 7M16 3 13 13M3 16l10-3" /></>
      : kind === 'orthographic' ? <><path d="M3 6 10 3l7 3v9l-7 3-7-3zM3 6l7 3 7-3M10 9v9" /></>
      : <><path d="M10 2 18 6v8l-8 4-8-4V6zM2 6l8 4 8-4M10 10v8" /><path d="M10 2v4" /></>}
  </svg>
}
