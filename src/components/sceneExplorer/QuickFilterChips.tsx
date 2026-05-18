'use client'
/**
 * BL-58 — Quick filter chip row
 *
 * Always-visible single-row strip with one-click presets. Sits under the
 * toolbar so users don't have to open the Filters popover for the common
 * cases. Mirrors the 3ds Max Scene Explorer category toolbar.
 *
 * Behaviour:
 *   - "All"        — clear every type filter to "on" (default state)
 *   - Type chip    — SOLO that type: only this type is on, others go off.
 *                    Clicking the same chip again restores "All".
 *   - "Animated"   — toggles the onlyAnimated flag.
 *   - "Hidden"     — toggles a UI flag exposed by the parent (show ONLY
 *                    hidden rows, useful when bulk-unhiding).
 */

import type {
  LayerVisibilityFilters, LayerTypeFilterKey,
} from '@/lib/sceneExplorer/visibilityFilters'
import { DEFAULT_VISIBILITY_FILTERS, isPassThrough } from '@/lib/sceneExplorer/visibilityFilters'

interface Props {
  filters: LayerVisibilityFilters
  onChange: (next: LayerVisibilityFilters) => void
}

interface ChipDef {
  key: LayerTypeFilterKey | 'all' | 'animated'
  label: string
  icon: string
  /** For type chips: the underlying filter key it solos. */
  type?: LayerTypeFilterKey
}

const CHIPS: ChipDef[] = [
  { key: 'all',      label: 'All',      icon: '✦' },
  { key: 'shape',    label: 'Shapes',   icon: '◼', type: 'shape'    },
  { key: 'text',     label: 'Text',     icon: 'T', type: 'text'     },
  { key: 'image',    label: 'Image',    icon: '🖼', type: 'image'    },
  { key: 'video',    label: 'Video',    icon: '▶', type: 'video'    },
  { key: 'audio',    label: 'Audio',    icon: '♪', type: 'audio'    },
  { key: 'path',     label: 'Path',     icon: '✎', type: 'path'     },
  { key: 'group',    label: 'Groups',   icon: '▣', type: 'group'    },
  { key: 'animated', label: 'Animated', icon: '◆' },
]

export default function QuickFilterChips({ filters, onChange }: Props) {
  // "All" = every type on AND no behaviour filter active.
  const allActive = isPassThrough(filters)

  // A type chip is "active" when ONLY that type is on (solo state) and no
  // behaviour filter is on — exactly the state a chip click produces.
  const soloType = (key: LayerTypeFilterKey): boolean => {
    if (filters.onlyAnimated || filters.onlyWithEffects) return false
    const t = filters.types
    return t[key] && Object.entries(t).every(([k, on]) => (k === key ? on : !on))
  }

  const applyAll = () => onChange(DEFAULT_VISIBILITY_FILTERS)

  const soloFor = (key: LayerTypeFilterKey) => {
    if (soloType(key)) {
      // Second click on the same chip → back to All
      applyAll()
      return
    }
    const nextTypes = { ...DEFAULT_VISIBILITY_FILTERS.types }
    for (const k of Object.keys(nextTypes) as LayerTypeFilterKey[]) {
      nextTypes[k] = k === key
    }
    onChange({ ...filters, types: nextTypes, onlyAnimated: false, onlyWithEffects: false })
  }

  const toggleAnimated = () => {
    onChange({ ...filters, onlyAnimated: !filters.onlyAnimated })
  }

  const chipClass = (active: boolean) =>
    `inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono rounded transition-colors shrink-0 ${
      active
        ? 'bg-blue-600 text-white'
        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
    }`

  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-700 bg-gray-900 overflow-x-auto shrink-0">
      {CHIPS.map((c) => {
        let active = false
        let onClick: () => void = () => {}
        if (c.key === 'all') {
          active = allActive
          onClick = applyAll
        } else if (c.key === 'animated') {
          active = filters.onlyAnimated
          onClick = toggleAnimated
        } else if (c.type) {
          active = soloType(c.type)
          onClick = () => soloFor(c.type!)
        }
        return (
          <button
            key={c.key}
            onClick={onClick}
            className={chipClass(active)}
            title={
              c.key === 'all'        ? 'Show all layer types'
              : c.key === 'animated' ? 'Only layers with keyframes'
              : `Show only ${c.label} (click again to reset)`
            }
          >
            <span>{c.icon}</span>
            <span>{c.label}</span>
          </button>
        )
      })}
    </div>
  )
}
