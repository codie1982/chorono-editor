'use client'
/**
 * BL-57 — Faceted search input with autocomplete
 *
 * Drop-in replacement for the plain text input that used to live inside
 * SceneExplorerPanel. Shows a suggestion dropdown driven by the trailing
 * token under the cursor:
 *   - empty / after space → suggest facet keys (type, has, is, name, …)
 *   - `type:` typed       → suggest its value catalogue (shape, text, …)
 *   - bare typing         → suggest facet keys whose name starts with input
 *
 * Keyboard:
 *   - ↑ / ↓        navigate suggestions
 *   - Enter / Tab  accept highlighted suggestion
 *   - Esc          close suggestions (preserves query text)
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Layer } from '@/lib/types'
import {
  FACET_KEYS, FACET_VALUES,
  classifyCursorToken, replaceCursorToken,
  distinctColorLabels, distinctParentIds,
  type FacetKey,
} from '@/lib/sceneExplorer/searchQuery'

interface Props {
  value:    string
  onChange: (next: string) => void
  layers:   Layer[]   // used for dynamic suggestions (color labels, parents)
}

interface Suggestion {
  /** Text actually inserted into the query (e.g. "type:" or "shape"). */
  insert: string
  /** Display label shown in the dropdown. */
  label:  string
  /** Optional secondary line (description). */
  description?: string
}

export default function SearchInput({ value, onChange, layers }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [open,   setOpen]   = useState(false)
  const [active, setActive] = useState(0)

  // Suggestions derived from the trailing-token classification + scene.
  const suggestions: Suggestion[] = useMemo(() => {
    const c = classifyCursorToken(value)

    if (c.expectKey) {
      const q = c.valuePrefix
      return FACET_KEYS
        .filter((k) => !q || k.startsWith(q))
        .map((k) => ({ insert: `${k}:`, label: `${k}:`, description: keyDescription(k) }))
    }
    if (!c.facetPrefix) return []

    // Static value catalogues (type / has / is)
    const staticValues = FACET_VALUES[c.facetPrefix]
    if (staticValues) {
      return Object.entries(staticValues)
        .filter(([key]) => !c.valuePrefix || key.toLowerCase().startsWith(c.valuePrefix))
        .map(([key, spec]) => ({ insert: key, label: key, description: spec.description }))
    }

    // Dynamic suggestion sources
    if (c.facetPrefix === 'color') {
      return distinctColorLabels(layers)
        .filter((c2) => !c.valuePrefix || c2.startsWith(c.valuePrefix))
        .map((c2) => ({ insert: c2, label: c2 }))
    }
    if (c.facetPrefix === 'parent') {
      return distinctParentIds(layers)
        .filter((id) => !c.valuePrefix || id.toLowerCase().includes(c.valuePrefix))
        .map((id) => ({ insert: id, label: id, description: 'Group id' }))
    }
    if (c.facetPrefix === 'name') {
      // Suggest existing layer names that match the prefix.
      const seen = new Set<string>()
      const out: Suggestion[] = []
      for (const l of layers) {
        if (!l.name) continue
        const n = l.name.toLowerCase()
        if (c.valuePrefix && !n.includes(c.valuePrefix)) continue
        if (seen.has(l.name)) continue
        seen.add(l.name)
        out.push({ insert: l.name, label: l.name })
        if (out.length >= 8) break
      }
      return out
    }
    return []
  }, [value, layers])

  // Reset active index whenever suggestions change so the highlight starts
  // at the top — otherwise it can point past the end of the list.
  useEffect(() => { setActive(0) }, [value])

  const accept = (s: Suggestion) => {
    const next = replaceCursorToken(value, s.insert)
    onChange(next)
    // Keep focus + keep suggestions open so the user can chain (type:
    // → shape → space → next facet).
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div className="relative ml-auto">
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder="Search… (type:shape has:keyframes)"
        spellCheck={false}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}  // delay so click-on-suggestion fires
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) {
            // Esc clears the query when there are no suggestions to dismiss.
            if (e.key === 'Escape' && value) { e.preventDefault(); onChange('') }
            return
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => (a + 1) % suggestions.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => (a - 1 + suggestions.length) % suggestions.length)
          } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault()
            accept(suggestions[active])
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setOpen(false)
          }
        }}
        className="w-44 px-1.5 py-0.5 text-[10px] bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono"
      />

      {open && suggestions.length > 0 && (
        <div className="absolute top-full right-0 mt-1 z-50 w-64 bg-gray-900 border border-gray-700 rounded shadow-xl py-1 max-h-72 overflow-auto">
          {suggestions.map((s, i) => (
            <button
              key={s.insert + i}
              onMouseDown={(e) => { e.preventDefault(); accept(s); setActive(i) }}
              onMouseEnter={() => setActive(i)}
              className={`w-full text-left px-2 py-1 text-[10px] font-mono flex items-baseline gap-2 ${
                i === active ? 'bg-blue-700/40 text-white' : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <span className="text-blue-300 shrink-0">{s.label}</span>
              {s.description && (
                <span className="text-gray-500 text-[9px] truncate">{s.description}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function keyDescription(key: FacetKey): string {
  switch (key) {
    case 'type':   return 'shape, text, image, video, …'
    case 'has':    return 'keyframes, modifiers, constraints, masks'
    case 'is':     return 'locked, hidden, solo, pinned, frozen'
    case 'name':   return 'substring of layer name'
    case 'color':  return 'colorLabel hex (e.g. #3B82F6)'
    case 'parent': return 'group id'
  }
}
