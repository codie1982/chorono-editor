'use client'
import { useEffect, useId, useRef, useState } from 'react'
import type { MenuActionItem } from '@/components/ui/ContextMenu'

export interface ToolbarMenuSection { label: string; items: readonly MenuActionItem[] }

/** Anchored action menu with native buttons and scoped keyboard navigation.
 * Owns only open/focus state; actions remain synchronous in the original user
 * gesture so native file pickers retain activation. Closing precedes invoking
 * an action; a newly opened dialog can then take focus. Outside dismissal does
 * not steal focus. Document listeners exist only while open and are disposed.
 */
export default function DropdownButton({ label, sections, status }: {
  label: string; sections: readonly ToolbarMenuSection[]; status?: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null), initial = useRef<'first' | 'last'>('first')
  const id = useId()
  useEffect(() => {
    if (!open) return
    const buttons = menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    buttons?.[initial.current === 'first' ? 0 : buttons.length - 1]?.focus()
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [open])
  return <div ref={root} className="relative shrink-0">
    <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      className="h-9 px-3 inline-flex items-center gap-2 whitespace-nowrap rounded bg-gray-700 text-xs font-medium text-gray-100 hover:bg-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
      onClick={() => { initial.current = 'first'; setOpen(value => !value) }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); event.stopPropagation(); initial.current = event.key === 'ArrowUp' ? 'last' : 'first'; setOpen(true)
        }
      }}>{label}<svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"><path d="m2 4 3 3 3-3" /></svg></button>
    {open && <div id={id} ref={menu} role="menu" aria-label={`${label} actions`}
      className="absolute right-0 top-full mt-1 z-[60] w-72 max-w-[calc(100vw-16px)] max-h-[calc(100vh-80px)] overflow-y-auto rounded-lg border border-gray-600 bg-gray-900 py-1.5 shadow-2xl"
      onKeyDown={event => {
        event.stopPropagation()
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); return }
        if (event.key === 'Tab') { setOpen(false); return }
        const buttons = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        let next: number | undefined
        if (event.key === 'ArrowDown') next = (index + 1) % buttons.length
        if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length
        if (event.key === 'Home') next = 0
        if (event.key === 'End') next = buttons.length - 1
        if (next !== undefined) { event.preventDefault(); buttons[next]?.focus() }
      }}>
      {sections.filter(section => section.items.length).map((section, index) => <div key={section.label} role="group" aria-label={section.label} className={index ? 'border-t border-gray-700 mt-1 pt-1' : ''}>
        <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-400">{section.label}</div>
        {section.items.map(item => <button key={item.label} type="button" role="menuitem" tabIndex={-1} disabled={item.disabled}
          className="block w-full min-h-9 px-3 py-2 text-left text-xs text-gray-100 hover:bg-blue-700 focus:bg-blue-700 focus:outline-none disabled:text-gray-500 disabled:hover:bg-transparent"
          onClick={() => { setOpen(false); trigger.current?.focus(); item.onSelect() }}>{item.label}</button>)}
      </div>)}
      {status && <p className="mx-3 mt-2 border-t border-gray-700 pt-2 pb-1 text-[11px] leading-relaxed text-gray-400" role="status">{status}</p>}
    </div>}
  </div>
}
