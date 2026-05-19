'use client'
import { useRef } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
}

export default function ColorInput({ value, onChange }: Props) {
  const pickerRef = useRef<HTMLInputElement>(null)

  const hex = value?.startsWith('#') ? value : '#000000'

  return (
    <div className="flex items-center gap-0 w-full rounded border border-gray-600 overflow-hidden focus-within:border-blue-500 transition-colors">
      {/* Color swatch — clicking opens the native color picker */}
      <button
        type="button"
        onClick={() => pickerRef.current?.click()}
        className="shrink-0 w-10 h-8 cursor-pointer border-r border-gray-600"
        style={{ background: hex }}
        title="Pick colour"
      />
      {/* Hidden native picker */}
      <input
        ref={pickerRef}
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
      />
      {/* Hex text input */}
      <input
        type="text"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        maxLength={7}
        className="flex-1 min-w-0 bg-gray-800 px-2 py-1 text-xs text-gray-100 font-mono uppercase
                   focus:outline-none placeholder-gray-600"
      />
    </div>
  )
}
