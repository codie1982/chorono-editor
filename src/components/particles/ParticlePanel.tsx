// ── ParticlePanel ─────────────────────────────────────────────────────────────
//
// Dedicated panel for particle-emitter layers. Lives as its own dock tab —
// kept OUT of the Properties panel because particle setups have ~25 controls
// and don't fit comfortably in the narrow Properties column.
//
// Layout sections (top → bottom):
//   1. Header             — selected layer name + small status badge
//   2. Preset             — one-click preset swap (full-width dropdown)
//   3. Source Layer       — pick another scene layer as the emit geometry
//   4. Emitter / Particle / Animation / Randomness / Rendering — schema-driven
//   5. Empty state        — when no particle layer is selected

'use client'

import type { ChronoScene, Layer } from '@/lib/types'
import SchemaPanel from '@/components/PropertiesPanel/SchemaPanel'
import ParticlePresetPicker from '@/components/PropertiesPanel/ParticlePresetPicker'

interface Props {
  scene:         ChronoScene
  selectedLayer: Layer | null
  onLayerChange: (layer: Layer) => void
}

export default function ParticlePanel({ scene, selectedLayer, onLayerChange }: Props) {
  const isParticle = selectedLayer?.type === 'particleEmitter'

  if (!isParticle) {
    return (
      <div className="flex flex-col h-full bg-gray-900 overflow-y-auto">
        <PanelHeader title="Particle Emitter" />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="text-4xl" aria-hidden>✨</span>
          <p className="text-sm text-gray-400 leading-relaxed">
            Select a <span className="font-semibold text-gray-200">Particle Emitter</span> layer
            to edit its settings here.
          </p>
          <p className="text-xs text-gray-500 leading-relaxed">
            Add one via the + menu → Particles → Particle Emitter.
          </p>
        </div>
      </div>
    )
  }

  const cfg     = (selectedLayer as any).particleEmitter
  const shape   = cfg?.emitter?.shape
  const isFromLayer = shape === 'sourceLayer'

  return (
    <div className="flex flex-col h-full bg-gray-900 overflow-y-auto">
      <PanelHeader title="Particle Emitter" subtitle={selectedLayer.id} />

      <div className="flex flex-col gap-3 px-3 py-3">
        {/* Preset picker */}
        <ParticlePresetPicker layer={selectedLayer} onLayerChange={onLayerChange} />

        {/* Source Layer (only when emit shape is 'sourceLayer') */}
        {isFromLayer && (
          <SourceLayerPicker
            scene={scene}
            layer={selectedLayer}
            onLayerChange={onLayerChange}
          />
        )}

        {/* All other settings — schema-driven (Emitter / Particle / Animation
            / Randomness / Rendering). Transform / Appearance are intentionally
            excluded here since the user edits those in the Properties panel. */}
        <SchemaPanel
          layer={selectedLayer}
          onLayerChange={onLayerChange}
          filterGroup={(g) => g.title !== 'Transform' && g.title !== 'Appearance'}
        />
      </div>
    </div>
  )
}

// ── Header ────────────────────────────────────────────────────────────────────

function PanelHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-3 py-2 border-b border-gray-700 shrink-0 flex items-center gap-2 bg-gray-950/60">
      <span className="text-xl" aria-hidden>✨</span>
      <div className="flex flex-col">
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
          {title}
        </span>
        {subtitle && (
          <span className="text-[10px] text-gray-500 font-mono">{subtitle}</span>
        )}
      </div>
    </div>
  )
}

// ── Source Layer Picker ───────────────────────────────────────────────────────
//
// Lets the user pick any other layer (shape / path / text / image) whose
// bounds drive the particle spawn region. Live: animating the source moves
// the emit area.

function SourceLayerPicker({
  scene, layer, onLayerChange,
}: {
  scene:         ChronoScene
  layer:         Layer
  onLayerChange: (layer: Layer) => void
}) {
  // Eligible sources: any layer with size (shapes / images / video / pathStroke)
  // or path data. Exclude the particle layer itself.
  const eligible = scene.layers.filter(l =>
    l.id !== layer.id &&
    l.type !== 'particleEmitter' &&
    (
      (l.size && l.size.width > 0 && l.size.height > 0) ||
      l.type === 'path'
    ),
  )

  const cfg     = (layer as any).particleEmitter
  const current = cfg?.emitter?.area?.sourceLayerId ?? ''

  function setSource(layerId: string) {
    onLayerChange({
      ...layer,
      particleEmitter: {
        ...cfg,
        emitter: {
          ...cfg.emitter,
          area: { ...(cfg.emitter.area ?? {}), sourceLayerId: layerId || undefined },
        },
      },
    } as Layer)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pt-1 border-t border-gray-700">
        Source Layer (geometry)
      </div>
      {eligible.length === 0 ? (
        <p className="text-[11px] text-amber-400/80 bg-amber-950/30 border border-amber-900/40 rounded px-2 py-1.5 leading-snug">
          No eligible scene layers found. Add a shape, path, or image layer
          first — its bounds will define where particles spawn.
        </p>
      ) : (
        <select
          value={current}
          onChange={(e) => setSource(e.target.value)}
          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-200
                     focus:outline-none focus:border-blue-500"
        >
          <option value="">— pick a layer —</option>
          {eligible.map(l => (
            <option key={l.id} value={l.id}>
              {l.name || l.id} ({l.type})
            </option>
          ))}
        </select>
      )}
      <p className="text-[10px] text-gray-500 leading-snug">
        Particles will spawn within the bounds of the chosen layer. Animating
        that layer moves the emit area live.
      </p>
    </div>
  )
}
