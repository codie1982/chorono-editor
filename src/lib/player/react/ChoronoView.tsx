'use client'
// ── ChoronoView (React) ───────────────────────────────────────────────────────
//
// Thin React binding over ChronoPlayer + CanvasRenderAdapter — the web-SDK's
// drop-in component. The player core stays framework-free; this file is the only
// React surface, so the same ChronoPlayer powers React, vanilla JS and (later)
// the standalone HTML export unchanged.
//
//   <ChoronoView scene={scene} autoplay onEvent={(e) => …} />
//
// Imperative control via ref:
//   const ref = useRef<ChoronoViewHandle>(null)
//   ref.current?.play(); ref.current?.setParam('name', 'Engin')

import {
  useRef, useEffect, forwardRef, useImperativeHandle,
  type CSSProperties,
} from 'react'
import type { ChronoScene, SceneParameterValue } from '@/lib/types'
import type { AssetElementMap } from '@/lib/renderer'
import type { RuntimeEvent } from '@/lib/runtime/triggerEngine'
import { ChronoPlayer } from '../ChronoPlayer'
import { CanvasRenderAdapter } from '../RenderAdapter'

export interface ChoronoViewHandle {
  play(): void
  pause(): void
  stop(): void
  seek(timeMs: number): void
  setParam(name: string, value: SceneParameterValue): void
  dispatch(event: string, smId?: string): void
  /** Escape hatch to the underlying player. */
  getPlayer(): ChronoPlayer | null
}

export interface ChoronoViewProps {
  scene: ChronoScene
  /** Image/video elements keyed by Asset.id (for image/video layers). */
  assets?: AssetElementMap
  /** Start playing on mount. Default true. */
  autoplay?: boolean
  /** Loop at composition.durationMs. Default true. */
  loop?: boolean
  /** Receive every runtime event (lifecycle, trigger, click…). */
  onEvent?: (event: RuntimeEvent) => void
  /** Called once the player is constructed (imperative access). */
  onReady?: (player: ChronoPlayer) => void
  className?: string
  style?: CSSProperties
}

export const ChoronoView = forwardRef<ChoronoViewHandle, ChoronoViewProps>(function ChoronoView(
  { scene, assets, autoplay = true, loop = true, onEvent, onReady, className, style },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playerRef = useRef<ChronoPlayer | null>(null)

  // Keep callbacks current without re-creating the player every render.
  const onEventRef = useRef(onEvent)
  const onReadyRef = useRef(onReady)
  onEventRef.current = onEvent
  onReadyRef.current = onReady

  useImperativeHandle(ref, (): ChoronoViewHandle => ({
    play:     () => playerRef.current?.play(),
    pause:    () => playerRef.current?.pause(),
    stop:     () => playerRef.current?.stop(),
    seek:     (t) => playerRef.current?.seek(t),
    setParam: (n, v) => playerRef.current?.setParam(n, v),
    dispatch: (e, smId) => playerRef.current?.dispatch(e, smId),
    getPlayer: () => playerRef.current,
  }), [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const player = new ChronoPlayer(scene, new CanvasRenderAdapter(ctx), { assets, loop })
    playerRef.current = player

    const off = player.onAny((e) => onEventRef.current?.(e))
    onReadyRef.current?.(player)

    if (autoplay) player.play()
    else player.tick(0)

    return () => {
      off()
      player.destroy()
      playerRef.current = null
    }
  }, [scene, assets, autoplay, loop])

  return (
    <canvas
      ref={canvasRef}
      width={scene.composition.width}
      height={scene.composition.height}
      className={className}
      style={style}
    />
  )
})
