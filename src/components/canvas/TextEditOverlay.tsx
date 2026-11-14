'use client'

import { useEffect, useRef, useState } from 'react'
import type { Asset, Layer } from '@/lib/types'
import { measureTextLayout } from '@/lib/text/measureText'
import { resolveTextFontFamily } from '@/lib/text/resolveTextFontFamily'
import type { Matrix2D } from '@/lib/geometry/Matrix2D'

interface Props {
  layer: Layer
  assets: readonly Asset[]
  zoom: number
  worldMatrix: Matrix2D
  onCommit: (value: string) => void
  onCancel: () => void
}

/** A real text input anchored to the selected layer in composition space. */
export function TextEditOverlay({ layer, assets, zoom, worldMatrix, onCommit, onCancel }: Props) {
  const [value, setValue] = useState(layer.text?.value ?? '')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const finished = useRef(false)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const text = layer.text!
  const metrics = measureTextLayout({ ...text, value }, assets)
  const blockLeft = text.direction === 'vertical' ? 0
    : text.textAlign === 'center' ? -metrics.width / 2
    : text.textAlign === 'right' ? -metrics.width : 0
  const finish = (commit: boolean) => {
    if (finished.current) return
    finished.current = true
    if (commit) onCommit(value)
    else onCancel()
  }

  return (
    <div className="absolute left-0 top-0 z-40" style={{
      transform: `matrix(${worldMatrix.a},${worldMatrix.b},${worldMatrix.c},${worldMatrix.d},${worldMatrix.e * zoom},${worldMatrix.f * zoom})`,
      transformOrigin: '0 0',
    }}>
      <textarea ref={inputRef} value={value} spellCheck={false}
        aria-label="Edit text on canvas"
        onChange={(e) => setValue(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') { e.preventDefault(); finish(false) }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); finish(true) }
        }}
        className="block resize-none overflow-hidden border border-blue-400 bg-gray-950/90 text-white outline-none ring-2 ring-blue-500/40 shadow-xl"
        style={{
          position: 'relative', left: blockLeft * zoom,
          width: Math.max(20, metrics.width + 16) * zoom,
          height: Math.max(40, metrics.height + 12) * zoom,
          padding: `${4 * zoom}px`,
          font: `${text.fontStyle ?? 'normal'} ${text.fontWeight ?? 'normal'} ${text.fontSize * zoom}px ${resolveTextFontFamily(text.fontFamily ?? 'sans-serif', assets)}`,
          lineHeight: text.lineHeight ?? 1.2,
          letterSpacing: `${(text.letterSpacing ?? 0) * zoom}px`,
          textAlign: text.textAlign ?? 'left',
          writingMode: text.direction === 'vertical' ? 'vertical-rl' : 'horizontal-tb',
          textOrientation: text.direction === 'vertical' ? 'upright' : undefined,
          whiteSpace: 'pre',
        }}
      />
      <span className="absolute left-0 top-full mt-1 rounded bg-gray-950 px-1.5 py-0.5 text-[10px] text-gray-300 whitespace-nowrap">
        Ctrl/⌘ + Enter: apply · Esc: cancel
      </span>
    </div>
  )
}
