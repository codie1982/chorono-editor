'use client'
// ── ChronoPlayerPanel ─────────────────────────────────────────────────────────
// Live runtime preview using the web-SDK player. Renders the scene through
// ChronoPlayer (via <ChoronoView>) on its own canvas — exactly what the export
// produces, free of editor chrome. Canvas clicks drive state machines/triggers
// (interactive).
//
// Distinct from RuntimePreviewPanel, which only hosts parameter/event/segment
// controls over the editor's interactive runtime.

import { useRef, useState } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { AssetElementMap } from '@/lib/renderer'
import { ChoronoView, type ChoronoViewHandle } from '@/lib/player/react'

interface Props {
  scene: ChronoScene
  assets: AssetElementMap
}

export default function ChronoPlayerPanel({ scene, assets }: Props) {
  const ref = useRef<ChoronoViewHandle>(null)
  const [playing, setPlaying] = useState(true)
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

  return (
    <div className="flex flex-col h-full text-xs text-gray-300 bg-neutral-900">
      {/* Header / controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Runtime Player
        </span>
        <div className="flex items-center gap-1">
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

      {/* Player canvas — letterboxed to fit the panel */}
      <div className="flex-1 flex items-center justify-center overflow-hidden p-2">
        <ChoronoView
          key={restartKey}
          ref={ref}
          scene={scene}
          assets={assets}
          autoplay
          loop
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        />
      </div>

      <div className="px-3 py-1.5 border-t border-gray-800 text-[9px] text-gray-600">
        Plays via @chorono/runtime — clicks drive state machines. Identical to the exported output.
      </div>
    </div>
  )
}
