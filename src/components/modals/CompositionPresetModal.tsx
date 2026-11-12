'use client'
import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'
import { useState } from 'react'
import type { Composition, CompositionPreset } from '@/lib/types'
import { COMPOSITION_PRESETS } from '@/lib/types'
import ColorInput from '@/components/inputs/ColorInput'

interface Props {
  composition: Composition
  onApply: (next: Composition) => void
  onClose: () => void
}

/**
 * Preset grid for composition size: pick a social-media-sized canvas or
 * enter custom dimensions. Frame rate + background remain editable in the
 * detail row beneath the grid.
 */
export default function CompositionPresetModal({ composition, onApply, onClose }: Props) {
  const [width,  setWidth]  = useState(composition.width)
  const [height, setHeight] = useState(composition.height)
  const [fps,    setFps]    = useState(composition.frameRate)
  const [bg,     setBg]     = useState(composition.backgroundColor)

  const apply = (next?: Partial<Composition>) => {
    onApply({
      ...composition,
      width:  next?.width  ?? width,
      height: next?.height ?? height,
      frameRate:       next?.frameRate       ?? fps,
      backgroundColor: next?.backgroundColor ?? bg,
    })
    onClose()
  }

  const pickPreset = (p: CompositionPreset) => {
    if (p.id === 'custom') return  // custom keeps user inputs
    setWidth(p.width); setHeight(p.height)
    apply({ width: p.width, height: p.height })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-w-2xl w-full mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">
            Composition Size
          </h2>
          <DocumentationHelp topic="editor/projects" className="ml-auto mr-1" />
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        {/* Preset grid */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {COMPOSITION_PRESETS.filter((p) => p.id !== 'custom').map((p) => {
            const isActive = composition.width === p.width && composition.height === p.height
            return (
              <button
                key={p.id}
                onClick={() => pickPreset(p)}
                className={`p-3 rounded border text-left transition-colors
                  ${isActive
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-300'}`}
              >
                <div className="text-xs font-medium">{p.name.split('(')[0].trim()}</div>
                <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                  {p.width}×{p.height}
                </div>
                <PreviewBox w={p.width} h={p.height} />
              </button>
            )
          })}
        </div>

        {/* Custom + advanced */}
        <div className="border-t border-gray-700 pt-4 space-y-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Custom</div>
          <div className="grid grid-cols-4 gap-2 items-end">
            <Field label="Width">
              <CalculationNumberInput aria-label="width" value={width} min={1}
                onChange={(e) => setWidth(Number(e.target.value))}
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200" onCalculate={calculated => setWidth(calculated)} />
            </Field>
            <Field label="Height">
              <CalculationNumberInput aria-label="height" value={height} min={1}
                onChange={(e) => setHeight(Number(e.target.value))}
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200" onCalculate={calculated => setHeight(calculated)} />
            </Field>
            <Field label="FPS">
              <CalculationNumberInput aria-label="fps" value={fps} min={1} max={120}
                onChange={(e) => setFps(Number(e.target.value))}
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200" onCalculate={calculated => setFps(calculated)} />
            </Field>
            <Field label="Background">
              <ColorInput value={bg} onChange={(v) => setBg(v)} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose}
              className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300">
              Cancel
            </button>
            <button onClick={() => apply()}
              className="px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white font-medium">
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</span>
      {children}
    </label>
  )
}

/** Tiny aspect-ratio preview rectangle for each preset card. */
function PreviewBox({ w, h }: { w: number; h: number }) {
  const maxSide = 36
  const aspect = w / h
  const boxW = aspect >= 1 ? maxSide : maxSide * aspect
  const boxH = aspect >= 1 ? maxSide / aspect : maxSide
  return (
    <div className="mt-2 flex justify-center">
      <div
        className="bg-current/20 border border-current/30 rounded-sm"
        style={{ width: `${boxW}px`, height: `${boxH}px`, opacity: 0.4 }}
      />
    </div>
  )
}
