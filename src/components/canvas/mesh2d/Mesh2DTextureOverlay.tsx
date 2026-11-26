'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import {
  mesh2DTextureSourceDimensions,
  resolveMesh2DTexturePlacement,
  resolveMesh2DTextureTransform,
  setMesh2DTextureTransform,
} from '@/lib/mesh2d'
import type { Layer } from '@/lib/types'
import type { Mesh2DTextureTransform } from '@/lib/types/mesh2d'

interface Props {
  readonly layer: Layer
  readonly texture: CanvasImageSource
  readonly worldMatrix: Matrix2D
  readonly zoom: number
  readonly canvasRef: RefObject<HTMLCanvasElement>
  readonly editor: EditorStateReturn
}

type GestureKind = 'move' | 'scale' | 'rotate'

interface TextureGesture {
  readonly kind: GestureKind
  readonly pointerId: number
  readonly originalLayer: Layer
  readonly start: Mesh2DTextureTransform
  readonly startLocal: { x: number; y: number }
  readonly pivotLocal: { x: number; y: number }
  readonly startDistance: number
  readonly startAngle: number
  moved: boolean
  nextLayer: Layer
}

/**
 * Draws and edits one textured Mesh2D's source-image rectangle.
 *
 * Pointer previews use the editor transaction API and commit one history step.
 * Pointer coordinates are converted through the selected layer's complete
 * world matrix, so nested transforms do not leak into local texture offsets.
 * Arrow-key movement and the inspector provide non-drag alternatives.
 */
export function Mesh2DTextureOverlay({ layer, texture, worldMatrix, zoom, canvasRef, editor }: Props) {
  const dragRef = useRef<TextureGesture | null>(null)
  const dimensions = useMemo(() => mesh2DTextureSourceDimensions(texture), [texture])
  const placement = useMemo(() => {
    if (!layer.mesh2d || !dimensions) return null
    try {
      return resolveMesh2DTexturePlacement(
        layer.mesh2d.geometry, dimensions.width, dimensions.height, layer.mesh2d.appearance?.textureTransform,
      )
    } catch { return null }
  }, [layer.mesh2d, dimensions])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !dragRef.current) return
      event.preventDefault()
      editor.cancelTransaction()
      dragRef.current = null
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [editor])

  if (!placement || !dimensions || layer.locked || layer.frozen || layer.hidden) return null
  const screenCorners = placement.corners.map(point => {
    const world = worldMatrix.applyToPoint(point)
    return { x: world.x * zoom, y: world.y * zoom }
  })
  const pivotWorld = worldMatrix.applyToPoint(placement.pivot)
  const pivotScreen = { x: pivotWorld.x * zoom, y: pivotWorld.y * zoom }
  const topMid = midpoint(screenCorners[0], screenCorners[1])
  const center = average(screenCorners)
  const outward = normalize({ x: topMid.x - center.x, y: topMid.y - center.y }, { x: 0, y: -1 })
  const rotationHandle = { x: topMid.x + outward.x * 28, y: topMid.y + outward.y * 28 }
  const points = screenCorners.map(point => `${point.x},${point.y}`).join(' ')

  const pointerToLocal = (event: Pick<PointerEvent, 'clientX' | 'clientY'>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    try {
      return worldMatrix.invert().applyToPoint({
        x: (event.clientX - rect.left) / zoom,
        y: (event.clientY - rect.top) / zoom,
      })
    } catch { return null }
  }

  const begin = (kind: GestureKind) => (event: ReactPointerEvent<SVGElement>) => {
    if (event.button !== 0 || editor.isTransactionActive()) return
    const local = pointerToLocal(event.nativeEvent)
    if (!local) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const start = resolveMesh2DTextureTransform(layer.mesh2d?.appearance?.textureTransform)
    editor.beginTransaction()
    dragRef.current = {
      kind,
      pointerId: event.pointerId,
      originalLayer: layer,
      start,
      startLocal: local,
      pivotLocal: placement.pivot,
      startDistance: Math.max(distance(local, placement.pivot), 1e-6),
      startAngle: Math.atan2(local.y - placement.pivot.y, local.x - placement.pivot.x),
      moved: false,
      nextLayer: layer,
    }
  }

  const move = (event: ReactPointerEvent<SVGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const local = pointerToLocal(event.nativeEvent)
    if (!local) return
    if (!drag.moved && distance(local, drag.startLocal) * zoom < 2) return
    drag.moved = true
    event.preventDefault()
    event.stopPropagation()
    let patch: Partial<Omit<Mesh2DTextureTransform, 'schemaVersion'>>
    if (drag.kind === 'move') {
      patch = {
        offsetX: drag.start.offsetX + local.x - drag.startLocal.x,
        offsetY: drag.start.offsetY + local.y - drag.startLocal.y,
      }
    } else if (drag.kind === 'scale') {
      const factor = Math.max(distance(local, drag.pivotLocal) / drag.startDistance, 0.01)
      patch = { scaleX: drag.start.scaleX * factor, scaleY: drag.start.scaleY * factor }
    } else {
      const angle = Math.atan2(local.y - drag.pivotLocal.y, local.x - drag.pivotLocal.x)
      patch = { rotationDeg: drag.start.rotationDeg + (angle - drag.startAngle) * 180 / Math.PI }
    }
    const nextLayer = setMesh2DTextureTransform(drag.originalLayer, patch)
    drag.nextLayer = nextLayer
    const scene = editor.getScene()
    editor.previewTransaction({
      ...scene,
      layers: scene.layers.map(candidate => candidate.id === nextLayer.id ? nextLayer : candidate),
    })
  }

  const finish = (event: ReactPointerEvent<SVGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = null
    if (!drag.moved) { editor.cancelTransaction(); return }
    editor.commitTransaction(makeUpdateLayerCmd(
      drag.originalLayer.id,
      { mesh2d: drag.nextLayer.mesh2d },
      drag.originalLayer,
    ))
  }

  const cancel = (event: ReactPointerEvent<SVGElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = null
    editor.cancelTransaction()
  }

  const nudge = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    const vectors: Record<string, readonly [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    }
    const vector = vectors[event.key]
    if (!vector || editor.isTransactionActive()) return
    event.preventDefault()
    event.stopPropagation()
    const step = event.shiftKey ? 10 : 1
    const transform = resolveMesh2DTextureTransform(layer.mesh2d?.appearance?.textureTransform)
    const next = setMesh2DTextureTransform(layer, {
      offsetX: transform.offsetX + vector[0] * step,
      offsetY: transform.offsetY + vector[1] * step,
    })
    editor.dispatchCommand(makeUpdateLayerCmd(layer.id, { mesh2d: next.mesh2d }, layer))
  }

  const gestureEvents = { onPointerMove: move, onPointerUp: finish, onPointerCancel: cancel }
  return (
    <svg data-viewport-cursor-block="true" tabIndex={0} role="group"
      aria-label="Texture placement handles. Drag the image to move it, drag a corner to scale, or use arrow keys to move."
      onKeyDown={nudge}
      className="pointer-events-none absolute inset-0 z-20 size-full overflow-visible focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
      <line x1={topMid.x} y1={topMid.y} x2={rotationHandle.x} y2={rotationHandle.y}
        className="pointer-events-none stroke-amber-300" strokeWidth="1.5" />
      <polygon points={points} fill="rgba(251,191,36,0.08)" stroke="#FBBF24" strokeWidth="1.5"
        strokeDasharray="5 3" vectorEffect="non-scaling-stroke" className="pointer-events-auto cursor-move"
        aria-label="Move texture" onPointerDown={begin('move')} {...gestureEvents} />
      {screenCorners.map((point, index) => <g key={index} className="pointer-events-auto cursor-nwse-resize"
        aria-label="Scale texture" onPointerDown={begin('scale')} {...gestureEvents}>
        <circle cx={point.x} cy={point.y} r="12" fill="transparent" />
        <rect x={point.x - 4} y={point.y - 4} width="8" height="8" rx="1.5" fill="#111827" stroke="#FBBF24" strokeWidth="1.5" />
      </g>)}
      <g className="pointer-events-auto cursor-crosshair" aria-label="Rotate texture"
        onPointerDown={begin('rotate')} {...gestureEvents}>
        <circle cx={rotationHandle.x} cy={rotationHandle.y} r="12" fill="transparent" />
        <circle cx={rotationHandle.x} cy={rotationHandle.y} r="5" fill="#111827" stroke="#FBBF24" strokeWidth="1.5" />
      </g>
      <g className="pointer-events-none" aria-hidden="true">
        <circle cx={pivotScreen.x} cy={pivotScreen.y} r="5" fill="#111827" stroke="#FBBF24" strokeWidth="1.5" />
        <path d={`M${pivotScreen.x - 8} ${pivotScreen.y}H${pivotScreen.x + 8}M${pivotScreen.x} ${pivotScreen.y - 8}V${pivotScreen.y + 8}`}
          stroke="#FBBF24" strokeWidth="1" />
      </g>
    </svg>
  )
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function average(points: readonly { x: number; y: number }[]) {
  return points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 })
}

function normalize(value: { x: number; y: number }, fallback: { x: number; y: number }) {
  const length = Math.hypot(value.x, value.y)
  return length > 1e-6 ? { x: value.x / length, y: value.y / length } : fallback
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
