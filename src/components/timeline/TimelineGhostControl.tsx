'use client'

import { useRef, useEffect, useState } from 'react'
import type { TimelineGhostSettings } from '@/lib/types/editor'

interface Props {
  ghostSettings: TimelineGhostSettings
  selectedLayerIds: Set<string>
  onUpdateSettings: (patch: Partial<TimelineGhostSettings>) => void
  onToggle: () => void
  onApplyPreset: (preset: 'off' | 'light' | 'medium' | 'heavy') => void
}

/**
 * Timeline Ghost/Onion-Skin Control
 * Dropdown with quick presets and detailed settings.
 */
export default function TimelineGhostControl({
  ghostSettings,
  selectedLayerIds,
  onUpdateSettings,
  onToggle,
  onApplyPreset,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const isGhostVisible = ghostSettings.enabled
  const canShowSelected = selectedLayerIds.size > 0

  return (
    <div ref={menuRef} className="relative">
      {/* Ghost Button */}
      <button
        onClick={() => setMenuOpen((o) => !o)}
        title="Ghost Frames / Onion Skin"
        className={`px-2 py-1 text-xs rounded font-mono flex items-center gap-1
          ${
            isGhostVisible
              ? 'bg-purple-600 hover:bg-purple-500 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
      >
        🎬 Ghost {isGhostVisible && '●'}
      </button>

      {/* Dropdown Menu */}
      {menuOpen && (
        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl
                        z-50 w-80 p-3 space-y-3">
          {/* Quick Presets */}
          <div>
            <label className="text-[10px] font-mono text-gray-400 uppercase">
              Presets
            </label>
            <div className="flex gap-1 mt-1">
              {(
                [
                  { label: 'Off', preset: 'off' as const },
                  { label: 'Light', preset: 'light' as const },
                  { label: 'Medium', preset: 'medium' as const },
                  { label: 'Heavy', preset: 'heavy' as const },
                ] as const
              ).map(({ label, preset }) => (
                <button
                  key={preset}
                  onClick={() => {
                    onApplyPreset(preset)
                    if (preset !== 'off') setMenuOpen(false)
                  }}
                  className={`flex-1 px-2 py-1 text-[10px] rounded font-mono transition-colors
                    ${
                      preset === 'off'
                        ? !isGhostVisible
                          ? 'bg-gray-600 text-white'
                          : 'bg-gray-700 text-gray-300'
                        : isGhostVisible && ghostSettings.beforeFrames === (preset === 'light' ? 2 : preset === 'medium' ? 5 : 10)
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Toggle Enable */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-700">
            <label className="text-[10px] font-mono text-gray-300">Enable</label>
            <button
              onClick={onToggle}
              className={`px-2 py-1 text-[10px] rounded font-mono
                ${
                  isGhostVisible
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300'
                }`}
            >
              {isGhostVisible ? 'On' : 'Off'}
            </button>
          </div>

          {/* Scope Selection */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-gray-400 uppercase block">
              Scope
            </label>
            <div className="flex gap-1">
              {(['all', 'selected'] as const).map((scope) => (
                <button
                  key={scope}
                  onClick={() => onUpdateSettings({ scope })}
                  disabled={scope === 'selected' && !canShowSelected}
                  className={`flex-1 px-2 py-1 text-[10px] rounded font-mono transition-colors
                    ${
                      ghostSettings.scope === scope && isGhostVisible
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }
                    ${scope === 'selected' && !canShowSelected ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  {scope === 'all' ? 'All Animated' : 'Selected Only'}
                </button>
              ))}
            </div>
          </div>

          {/* Frame Range Sliders */}
          <div className="space-y-2 pt-2 border-t border-gray-700">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-mono text-gray-300">Before</label>
                <span className="text-[10px] font-mono text-gray-400">
                  {ghostSettings.beforeFrames} frames
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                value={ghostSettings.beforeFrames}
                onChange={(e) =>
                  onUpdateSettings({ beforeFrames: parseInt(e.target.value, 10) })
                }
                className="w-full h-1 bg-gray-700 rounded cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-mono text-gray-300">After</label>
                <span className="text-[10px] font-mono text-gray-400">
                  {ghostSettings.afterFrames} frames
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                value={ghostSettings.afterFrames}
                onChange={(e) =>
                  onUpdateSettings({ afterFrames: parseInt(e.target.value, 10) })
                }
                className="w-full h-1 bg-gray-700 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* Opacity Slider */}
          <div className="pt-2 border-t border-gray-700">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-mono text-gray-300">Opacity</label>
              <span className="text-[10px] font-mono text-gray-400">
                {ghostSettings.opacity}%
              </span>
            </div>
            <input
              type="range"
              min="5"
              max="100"
              value={ghostSettings.opacity}
              onChange={(e) => onUpdateSettings({ opacity: parseInt(e.target.value, 10) })}
              className="w-full h-1 bg-gray-700 rounded cursor-pointer"
            />
          </div>

          {/* Info text */}
          <div className="text-[9px] text-gray-500 pt-2 border-t border-gray-700">
            <p>🎬 Ghost frames show interpolated layer states at each frame interval</p>
            <p className="mt-1">Higher opacity makes ghosts more visible; more frames show more steps</p>
          </div>
        </div>
      )}
    </div>
  )
}
