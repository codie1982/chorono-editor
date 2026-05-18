'use client'
/**
 * BL-58 — Scene Explorer status bar
 *
 * Bottom strip with at-a-glance counts and the currently-active filters.
 * Counts are computed from the raw layer list (not the filtered row list)
 * so the user always sees the TRUE scene composition; filter chips on the
 * right hand side hint which filters are narrowing the visible rows.
 */

import type { Layer } from '@/lib/types'
import type { LayerVisibilityFilters } from '@/lib/sceneExplorer/visibilityFilters'
import { isPassThrough } from '@/lib/sceneExplorer/visibilityFilters'

interface Props {
  layers:          Layer[]
  selectedIds:     Set<string>
  visibleRowCount: number
  textFilter:      string
  visibilityFilters: LayerVisibilityFilters
  isLayerAnimated?: (layer: Layer) => boolean
}

export default function SceneExplorerStatusBar({
  layers, selectedIds, visibleRowCount,
  textFilter, visibilityFilters, isLayerAnimated,
}: Props) {
  // Single pass over `layers` — keeps the status bar cheap on large scenes.
  let hidden = 0, locked = 0, solo = 0, pinned = 0, frozen = 0, animated = 0
  for (const l of layers) {
    if (l.hidden) hidden++
    if (l.locked) locked++
    if (l.solo)   solo++
    if (l.pinned) pinned++
    if (l.frozen) frozen++
    if (isLayerAnimated?.(l)) animated++
  }

  const totalSel = selectedIds.size
  const total    = layers.length

  // Active-filter hints — only render the chips for filters that are
  // actually narrowing the view, so the bar stays quiet by default.
  const chips: Array<{ key: string; label: string; tone: string }> = []
  if (textFilter.trim()) {
    chips.push({ key: 'text', label: `"${textFilter.trim()}"`, tone: 'bg-blue-700/40 text-blue-200' })
  }
  if (!isPassThrough(visibilityFilters)) {
    const offTypes = Object.entries(visibilityFilters.types).filter(([, on]) => !on).map(([k]) => k)
    if (offTypes.length > 0) {
      chips.push({ key: 'types', label: `−${offTypes.length} type${offTypes.length === 1 ? '' : 's'}`, tone: 'bg-purple-700/40 text-purple-200' })
    }
    if (visibilityFilters.onlyAnimated) {
      chips.push({ key: 'anim', label: 'animated', tone: 'bg-amber-700/40 text-amber-200' })
    }
    if (visibilityFilters.onlyWithEffects) {
      chips.push({ key: 'fx', label: 'with fx', tone: 'bg-emerald-700/40 text-emerald-200' })
    }
  }
  const filtered = visibleRowCount < total

  return (
    <div className="flex items-center gap-2 px-2 py-1 border-t border-gray-800 text-[9px] font-mono text-gray-500 shrink-0">
      {/* Counts */}
      <Stat label="Layers" value={total} tone="text-gray-300" />
      <Sep />
      <Stat label="Sel" value={totalSel} tone={totalSel > 0 ? 'text-blue-300' : 'text-gray-600'} />
      {hidden   > 0 && <><Sep /><Stat label="Hidden"   value={hidden}   tone="text-gray-600" /></>}
      {locked   > 0 && <><Sep /><Stat label="Locked"   value={locked}   tone="text-yellow-500" /></>}
      {solo     > 0 && <><Sep /><Stat label="Solo"     value={solo}     tone="text-amber-400" /></>}
      {pinned   > 0 && <><Sep /><Stat label="Pinned"   value={pinned}   tone="text-cyan-400" /></>}
      {frozen   > 0 && <><Sep /><Stat label="Frozen"   value={frozen}   tone="text-cyan-300" /></>}
      {animated > 0 && <><Sep /><Stat label="Animated" value={animated} tone="text-yellow-300" /></>}

      {/* Right side: filter chips + visible/total when filtered */}
      <div className="ml-auto flex items-center gap-1">
        {chips.map((c) => (
          <span key={c.key} className={`px-1.5 py-0.5 rounded ${c.tone}`}>{c.label}</span>
        ))}
        {filtered && (
          <span className="ml-1 text-blue-300">
            showing {visibleRowCount}/{total}
          </span>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-gray-600">{label}:</span>
      <span className={tone}>{value}</span>
    </span>
  )
}

function Sep() {
  return <span className="text-gray-800">·</span>
}
