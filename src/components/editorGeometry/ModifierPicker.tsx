'use client'
import { useState } from 'react'
import ContextMenu from '@/components/ui/ContextMenu'

/** Type-filtered chooser reusing the editor's keyboard/outside-dismiss menu.
 * Selection asks the host to create a real instance. The registry owns options; */
export function ModifierPicker<T extends string>({ kind, items, selected, disabled, onSelect }: {
  kind: 'Spline' | 'Mesh'; items: readonly { id: T; label: string }[]
  selected: T | ''; disabled?: boolean; onSelect(value: T | ''): void
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const active = items.find(item => item.id === selected)
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">{kind} modifiers</h3>
      <button type="button" aria-label={`Add ${kind} modifiers`} aria-haspopup="menu" aria-expanded={!!menu} disabled={disabled}
        className="min-h-8 rounded border border-gray-600 bg-gray-800 px-2.5 py-1.5 text-xs hover:bg-gray-700 focus-visible:outline focus-visible:outline-orange-300 disabled:opacity-40"
        onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setMenu(menu ? null : { x: rect.left, y: rect.bottom + 4 }) }}>+ Add modifiers</button>
    </div>
    {active && <div className="flex items-center gap-1 rounded border border-orange-400/60 bg-orange-500/10">
      <button type="button" aria-pressed="true" className="min-h-8 flex-1 px-2.5 py-1.5 text-left text-orange-100" onClick={() => onSelect(active.id)}>{active.label}</button>
      <button type="button" aria-label={`Close ${active.label} settings`} title="Close modifier settings" className="min-h-8 min-w-8 rounded text-gray-300 hover:bg-gray-700 focus-visible:outline focus-visible:outline-orange-300" onClick={() => onSelect('')}>×</button>
    </div>}
    {menu && <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={items.map(item => ({
      kind: 'action', label: item.label, disabled, onSelect: () => onSelect(item.id),
    }))} />}
  </div>
}
