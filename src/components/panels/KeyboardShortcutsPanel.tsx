'use client'
import { useState, useMemo } from 'react'
import { shortcutRegistry } from '@/lib/shortcuts'
import type { ShortcutDefinition, ShortcutContext, KeyBinding } from '@/lib/shortcuts'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

const CONTEXT_LABELS: Record<ShortcutContext, string> = {
  global:        'Global',
  canvas:        'Canvas',
  timeline:      'Timeline',
  graphEditor:   'Graph Editor',
  splineEdit:    'Spline Edit',
  textEdit:      'Text Edit',
  layerPanel:    'Layer Panel',
  assetLibrary:  'Asset Library',
  preview:       'Preview',
}

const CONTEXT_COLORS: Record<ShortcutContext, string> = {
  global:       'bg-yellow-600',
  canvas:       'bg-blue-600',
  timeline:     'bg-green-600',
  graphEditor:  'bg-purple-600',
  splineEdit:   'bg-orange-600',
  textEdit:     'bg-pink-600',
  layerPanel:   'bg-cyan-600',
  assetLibrary: 'bg-teal-600',
  preview:      'bg-rose-600',
}

// All keys shown in the visual keyboard layout
const KB_ROWS = [
  ['`','1','2','3','4','5','6','7','8','9','0','-','='],
  ['q','w','e','r','t','y','u','i','o','p','[',']'],
  ['a','s','d','f','g','h','j','k','l',';',"'"],
  ['z','x','c','v','b','n','m',',','.','/'],
]

function keyDisplayStr(def: ShortcutDefinition): string {
  if (def.binding.type !== 'keyboard') {
    const g = def.binding
    return `${g.modifiers?.join('+') ?? ''} + drag`.trim()
  }
  const b = def.binding as KeyBinding
  const parts: string[] = []
  if (b.meta)  parts.push(isMac ? '⌘' : 'Ctrl')
  if (b.alt)   parts.push(isMac ? '⌥' : 'Alt')
  if (b.shift) parts.push(isMac ? '⇧' : 'Shift')
  const k = b.key === ' ' ? 'Space' : b.key.length === 1 ? b.key.toUpperCase() : b.key
  parts.push(k)
  return parts.join(isMac ? '' : '+')
}

export default function KeyboardShortcutsPanel() {
  const [search, setSearch] = useState('')

  const all = shortcutRegistry.getAll()

  // Map: plain key → primary context that uses it
  const keyContextMap = useMemo(() => {
    const map = new Map<string, ShortcutContext>()
    for (const def of all) {
      if (def.binding.type !== 'keyboard') continue
      const b = def.binding as KeyBinding
      if (!b.meta && !b.alt && !b.shift) {
        // Use first/most-specific context (non-global preferred)
        const ctx = def.contexts.find(c => c !== 'global') ?? def.contexts[0]
        if (!map.has(b.key)) map.set(b.key, ctx)
      }
    }
    return map
  }, [all])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return all
    return all.filter(
      (d) =>
        d.label.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q) ||
        (d.description ?? '').toLowerCase().includes(q) ||
        keyDisplayStr(d).toLowerCase().includes(q),
    )
  }, [all, search])

  // Group by first non-global context; global items get their own group
  const groups = useMemo(() => {
    const map = new Map<ShortcutContext, ShortcutDefinition[]>()
    const order: ShortcutContext[] = ['global', 'canvas', 'timeline', 'graphEditor', 'splineEdit', 'textEdit', 'layerPanel', 'assetLibrary', 'preview']
    for (const ctx of order) map.set(ctx, [])
    for (const def of filtered) {
      const ctx = def.contexts.find(c => c !== 'global') ?? 'global'
      map.get(ctx)?.push(def)
    }
    return order.map((ctx) => ({ ctx, items: map.get(ctx)! })).filter((g) => g.items.length > 0)
  }, [filtered])

  return (
    <div className="h-full bg-gray-900 text-gray-200 overflow-auto flex flex-col">
      {/* ── Visual Keyboard ──────────────────────────────────────────────── */}
      <div className="p-3 border-b border-gray-800 shrink-0">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-semibold">Visual Keyboard</div>
        <div className="space-y-1">
          {KB_ROWS.map((row, ri) => (
            <div key={ri} className="flex gap-0.5">
              {row.map((key) => {
                const ctx = keyContextMap.get(key)
                const bg = ctx ? CONTEXT_COLORS[ctx] : 'bg-gray-800'
                return (
                  <div
                    key={key}
                    title={ctx ? `${key.toUpperCase()} — ${CONTEXT_LABELS[ctx]}` : key.toUpperCase()}
                    className={`
                      ${bg} rounded text-[9px] font-mono font-semibold
                      flex items-center justify-center cursor-default select-none
                      w-6 h-6 text-white/80 border border-white/10
                    `}
                  >
                    {key.toUpperCase()}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-2 mt-2">
          {(['global','canvas','timeline'] as ShortcutContext[]).map((ctx) => (
            <span key={ctx} className="flex items-center gap-1 text-[10px] text-gray-400">
              <span className={`w-2 h-2 rounded-full ${CONTEXT_COLORS[ctx]}`} />
              {CONTEXT_LABELS[ctx]}
            </span>
          ))}
        </div>
      </div>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className="p-3 border-b border-gray-800 shrink-0">
        <input
          type="text"
          placeholder="Search shortcuts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500"
        />
      </div>

      {/* ── Shortcut List ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-3 space-y-4">
        {groups.map(({ ctx, items }) => (
          <div key={ctx}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={`w-2 h-2 rounded-full ${CONTEXT_COLORS[ctx]}`} />
              <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                {CONTEXT_LABELS[ctx]}
                <span className="ml-1 text-gray-600 normal-case font-normal">({items.length})</span>
              </span>
            </div>
            <div className="space-y-0.5">
              {items.map((def) => (
                <ShortcutRow key={def.id} def={def} />
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="text-xs text-gray-500 text-center pt-6">No shortcuts match "{search}"</p>
        )}
      </div>
    </div>
  )
}

function ShortcutRow({ def }: { def: ShortcutDefinition }) {
  return (
    <div className="flex items-center justify-between px-2 py-1 rounded hover:bg-gray-800 group">
      <div className="flex-1 min-w-0 mr-2">
        <span className="text-xs text-gray-300 truncate block">{def.label}</span>
        {def.description && (
          <span className="text-[10px] text-gray-500 truncate block">{def.description}</span>
        )}
      </div>
      <KeyChip def={def} />
    </div>
  )
}

function KeyChip({ def }: { def: ShortcutDefinition }) {
  const str = keyDisplayStr(def)
  const parts = def.binding.type === 'keyboard'
    ? str.split(isMac ? '' : '+').filter(Boolean)
    : [str]

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {parts.map((p, i) => (
        <span
          key={i}
          className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-300 font-mono text-[10px] min-w-[1.4rem]"
        >
          {p}
        </span>
      ))}
    </div>
  )
}
