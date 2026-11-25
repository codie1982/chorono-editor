'use client'

import { useEffect, useRef, useState } from 'react'

interface ZoomScaleMenuProps {
  zoom: number
  onZoom: (scale: number) => void
}

/**
 * Provides the discrete viewport scale choices attached to the current zoom
 * percentage. The menu owns only its open state; the canvas remains the
 * source of truth for the active scale and applies the chosen world-to-screen
 * zoom through `onZoom`.
 */
export function ZoomScaleMenu({ zoom, onZoom }: ZoomScaleMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const presets = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
  const currentPercent = Math.round(zoom * 100)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Zoom scale options"
        className="min-w-[42px] text-center px-1.5 py-0.5 rounded hover:bg-gray-700"
      >
        {currentPercent}%
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Zoom scale options"
          className="absolute bottom-full left-1/2 z-50 mb-1 min-w-[112px] -translate-x-1/2 rounded border border-gray-700 bg-gray-900 py-1 shadow-xl"
        >
          {presets.map(scale => {
            const selected = Math.abs(zoom - scale) < 0.001
            return (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                key={scale}
                onClick={() => { onZoom(scale); setOpen(false) }}
                className={selected
                  ? 'flex w-full items-center justify-between gap-4 bg-blue-600 px-3 py-1.5 text-left text-xs text-white'
                  : 'flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-xs text-gray-200 hover:bg-gray-800'}
              >
                <span>{Math.round(scale * 100)}%</span>
                {selected && <span aria-hidden="true">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
