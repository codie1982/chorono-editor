'use client'
// ── ChronoPlayerPanel ─────────────────────────────────────────────────────────
// Live runtime preview using the web-SDK player. Renders the scene through
// ChronoPlayer (via <ChoronoView>) on its own canvas — exactly what the export
// produces, free of editor chrome. Canvas clicks drive state machines/triggers
// (interactive). An optional device frame (phone / browser) mocks how the
// animation looks embedded on a target surface.
//
// Distinct from RuntimePreviewPanel, which only hosts parameter/event/segment
// controls over the editor's interactive runtime.

import { useRef, useState, type ReactNode } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { AssetElementMap } from '@/lib/renderer'
import { ChoronoView, type ChoronoViewHandle } from '@/lib/player/react'

interface Props {
  scene: ChronoScene
  assets: AssetElementMap
}

type FrameKind = 'none' | 'phone' | 'browser'

export default function ChronoPlayerPanel({ scene, assets }: Props) {
  const ref = useRef<ChoronoViewHandle>(null)
  const [playing, setPlaying] = useState(true)
  const [frame, setFrame] = useState<FrameKind>('none')
  // Bumping this key remounts ChoronoView → restarts playback from 0.
  const [restartKey, setRestartKey] = useState(0)

  const togglePlay = () => {
    const p = ref.current
    if (!p) return
    if (playing) p.pause()
    else p.play()
    setPlaying((v) => !v)
  }

  const restart = () => {
    setRestartKey((k) => k + 1)
    setPlaying(true)
  }

  const view = (
    <ChoronoView
      key={restartKey}
      ref={ref}
      scene={scene}
      assets={assets}
      autoplay
      loop
      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
    />
  )

  return (
    <div className="flex flex-col h-full text-xs text-gray-300 bg-neutral-900">
      {/* Header / controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Runtime Player
        </span>
        <div className="flex items-center gap-2">
          <FrameSelector value={frame} onChange={setFrame} />
          <div className="w-px h-4 bg-gray-700" />
          <button
            onClick={togglePlay}
            className="text-[11px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-200"
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <button
            onClick={restart}
            className="text-[11px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-200"
            title="Restart from 0"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Player canvas — optionally wrapped in a device frame */}
      <div className="flex-1 flex items-center justify-center overflow-hidden p-3">
        <DeviceFrame kind={frame}>{view}</DeviceFrame>
      </div>

      <div className="px-3 py-1.5 border-t border-gray-800 text-[9px] text-gray-600">
        Plays via @chorono/runtime — clicks drive state machines. Identical to the exported output.
      </div>
    </div>
  )
}

// ── Frame selector ─────────────────────────────────────────────────────────────

function FrameSelector({ value, onChange }: { value: FrameKind; onChange: (k: FrameKind) => void }) {
  const opt = (k: FrameKind, label: string, title: string) => (
    <button
      onClick={() => onChange(k)}
      title={title}
      className={`text-[11px] px-1.5 py-0.5 rounded ${
        value === k ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
      }`}
    >
      {label}
    </button>
  )
  return (
    <div className="flex items-center gap-1">
      {opt('none', '▢', 'No frame')}
      {opt('phone', '📱', 'Phone frame')}
      {opt('browser', '🖥', 'Browser frame')}
    </div>
  )
}

// ── Device frame mockups (CSS only) ─────────────────────────────────────────────

function DeviceFrame({ kind, children }: { kind: FrameKind; children: ReactNode }) {
  if (kind === 'phone') {
    return (
      <div
        className="relative bg-black flex items-center justify-center"
        style={{
          border: '10px solid #0a0a0a',
          borderRadius: 36,
          boxShadow: '0 0 0 2px #333, 0 12px 40px rgba(0,0,0,0.6)',
          maxWidth: '100%',
          maxHeight: '100%',
          overflow: 'hidden',
        }}
      >
        {/* notch */}
        <div
          className="absolute top-1 left-1/2 -translate-x-1/2 bg-black rounded-full z-10"
          style={{ width: 90, height: 16, boxShadow: '0 0 0 1px #222' }}
        />
        {children}
      </div>
    )
  }

  if (kind === 'browser') {
    return (
      <div
        className="bg-neutral-800 flex flex-col"
        style={{
          border: '1px solid #333',
          borderRadius: 8,
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          maxWidth: '100%',
          maxHeight: '100%',
          overflow: 'hidden',
        }}
      >
        {/* chrome bar */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 border-b border-gray-700 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
          <div className="ml-2 flex-1 h-4 rounded bg-neutral-800 border border-gray-700 text-[9px] text-gray-500 flex items-center px-2">
            chorono.app/preview
          </div>
        </div>
        <div className="flex items-center justify-center overflow-hidden">{children}</div>
      </div>
    )
  }

  return <>{children}</>
}
