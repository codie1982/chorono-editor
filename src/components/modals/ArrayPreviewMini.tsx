'use client'
// ── ArrayPreviewMini (BL-59 Phase 2) ──────────────────────────────────────────
//
// Small SVG preview that lives INSIDE the ArrayModal. Uses
// ArrayTransformResolver to compute per-instance transforms, then renders
// each as a ghost rectangle scaled to fit a 240×140 canvas.
//
// This is the "non-allocating preview" the v2 plan called for — no real
// layers, no scene mutation, recalculates instantly as settings change.
//
// Performance: for counts > 200 we drop down to point-only rendering to
// keep the modal responsive while typing.

import { useMemo } from 'react'
import type { Layer } from '@/lib/types'
import type { ArraySettings } from '@/lib/array/ArrayTypes'
import {
  countArrayInstances,
  resolveArrayTransforms,
} from '@/lib/array/ArrayTransformResolver'

interface Props {
  source: Layer
  settings: ArraySettings
  /** Optional — only needed for Path-pattern previews. */
  allLayers?: Layer[]
}

const W = 240
const H = 140
const PAD = 12

export default function ArrayPreviewMini({ source, settings, allLayers = [] }: Props) {
  const { transforms, viewBox, lodMode } = useMemo(() => {
    const t = resolveArrayTransforms(source, settings, allLayers)
    const total = countArrayInstances(settings)
    const lod: 'full' | 'wireframe' | 'points' =
      total <= 100 ? 'full' : total <= 500 ? 'wireframe' : 'points'

    // Compute bbox over all ghosts. Source size is approximated from
    // layer.size (shapes) or a 40px default otherwise.
    const sw = source.size?.width  ?? 40
    const sh = source.size?.height ?? 40

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const inst of t) {
      const halfW = (sw * Math.abs(inst.scale.x)) / 2
      const halfH = (sh * Math.abs(inst.scale.y)) / 2
      minX = Math.min(minX, inst.position.x - halfW)
      minY = Math.min(minY, inst.position.y - halfH)
      maxX = Math.max(maxX, inst.position.x + halfW)
      maxY = Math.max(maxY, inst.position.y + halfH)
    }
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1 }

    // SVG viewBox includes 5% margin so ghosts aren't flush against edges.
    const w = Math.max(1, maxX - minX)
    const h = Math.max(1, maxY - minY)
    const margin = Math.max(w, h) * 0.05
    return {
      transforms: t,
      viewBox: `${minX - margin} ${minY - margin} ${w + margin * 2} ${h + margin * 2}`,
      lodMode: lod,
    }
  }, [source, settings])

  const sw = source.size?.width  ?? 40
  const sh = source.size?.height ?? 40

  return (
    <div className="mb-3">
      <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
        Preview ({transforms.length} instance{transforms.length === 1 ? '' : 's'},
        {' '}LOD: {lodMode})
      </label>
      <div
        className="bg-gray-950 border border-gray-800 rounded overflow-hidden"
        style={{ width: W, height: H }}
      >
        <svg width="100%" height="100%" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
          {transforms.map((inst, i) => {
            const cx = inst.position.x
            const cy = inst.position.y

            if (lodMode === 'points') {
              return (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={1.5}
                  fill={inst.isSourceIndex ? '#22d3ee' : '#3b82f6'}
                />
              )
            }

            const w = sw * Math.abs(inst.scale.x)
            const h = sh * Math.abs(inst.scale.y)
            return (
              <g
                key={i}
                transform={`translate(${cx},${cy}) rotate(${inst.rotation})`}
              >
                <rect
                  x={-w / 2}
                  y={-h / 2}
                  width={w}
                  height={h}
                  fill={inst.isSourceIndex ? 'rgba(34,211,238,0.18)' : 'rgba(59,130,246,0.14)'}
                  stroke={inst.isSourceIndex ? '#22d3ee' : '#3b82f6'}
                  strokeWidth={Math.max(0.5, Math.max(w, h) * 0.02)}
                />
              </g>
            )
          })}
        </svg>
      </div>
      <div className="mt-1 text-[10px] text-gray-600">
        Cyan = source · Blue = new clones
        {lodMode !== 'full' && (
          <span className="ml-1">
            (simplified — apply to see full transforms)
          </span>
        )}
      </div>
    </div>
  )
}

// Suppress unused warning for the PAD constant — kept for future padding tuning.
void PAD
