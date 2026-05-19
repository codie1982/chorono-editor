// ── ParticlePresetPicker ─────────────────────────────────────────────────────
//
// Top-of-panel widget that lets the user swap the active particle emitter
// preset in one click. Replaces the entire `particleEmitter` config — not
// expressible via PropertySchema's dot-path, hence a hand-written widget.

'use client'

import type { Layer } from '@/lib/types'
import { PARTICLE_PRESETS } from '@/lib/particles/presets'

interface Props {
  layer:         Layer
  onLayerChange: (layer: Layer) => void
}

export default function ParticlePresetPicker({ layer, onLayerChange }: Props) {
  // Try to guess the active preset by deep-comparing first-stop colour /
  // particle shape against each registered preset. Cheap heuristic — used
  // only to display the current selection in the <select>.
  const current = guessCurrentPresetId(layer)

  function apply(presetId: string) {
    const preset = PARTICLE_PRESETS.find(p => p.id === presetId)
    if (!preset) return
    // createData() returns a fresh deep-cloneable config; calling it each
    // time guarantees no shared references between layers + the registry.
    onLayerChange({
      ...layer,
      particleEmitter: preset.createData(),
    } as Layer)
  }

  return (
    <div className="flex flex-col gap-2 pt-1">
      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-t border-gray-700 pt-2">
        Preset
      </div>
      <select
        value={current ?? ''}
        onChange={(e) => apply(e.target.value)}
        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-200
                   focus:outline-none focus:border-blue-500"
      >
        <option value="" disabled>— pick a preset —</option>
        {PARTICLE_PRESETS.map(p => (
          <option key={p.id} value={p.id}>
            {p.name} {p.mobileSafe ? '📱' : ''} ({p.category})
          </option>
        ))}
      </select>
      <p className="text-[10px] text-gray-500 leading-snug">
        Picking a preset overwrites all particle settings below.
      </p>
    </div>
  )
}

// ── Heuristic preset-matcher ─────────────────────────────────────────────────
// Compares particle shape + emitter mode against each registered preset; the
// first close match wins. Exact match isn't needed — this only drives the
// <select>'s "current" indicator.

function guessCurrentPresetId(layer: Layer): string | null {
  const cfg = (layer as any).particleEmitter
  if (!cfg) return null
  for (const p of PARTICLE_PRESETS) {
    const sample = p.createData()
    if (
      sample.particle.shape === cfg.particle?.shape &&
      sample.emitter.mode   === cfg.emitter?.mode &&
      sample.emitter.shape  === cfg.emitter?.shape
    ) {
      return p.id
    }
  }
  return null
}
