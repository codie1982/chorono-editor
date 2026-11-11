'use client'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MenuActionItem } from '@/components/ui/ContextMenu'

export interface ToolbarMenuSection { label: string; items: readonly MenuActionItem[] }

interface PrimaryAction {
  /** A short click or Enter/Space invokes this action; a 400 ms hold opens options. */
  onSelect: () => void
  disabled?: boolean
  title: string
  className: string
}

/** Anchored action menu with native buttons and scoped keyboard navigation.
 * Owns only open/focus state; actions remain synchronous in the original user
 * gesture so native file pickers retain activation. Closing precedes invoking
 * an action; a newly opened dialog can then take focus. Outside dismissal does
 * not steal focus. A primary action enables long-press options without adding
 * a second trigger. Cancel, movement, blur and unmount clear pending holds;
 * releasing after a hold never invokes the primary action. Arrow keys and
 * Shift+F10 provide the same menu without a pointer. The portal flips above
 * low triggers and escapes dock clipping. Listeners exist only while needed.
 */
export default function DropdownButton({ label, sections, status, primaryAction }: {
  label: string; sections: readonly ToolbarMenuSection[]; status?: string; primaryAction?: PrimaryAction
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null), initial = useRef<'first' | 'last'>('first')
  const id = useId()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null), suppressClick = useRef(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  /** Cancels only a pending hold; the click suppression survives pointerup. */
  const cancelHold = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; origin.current = null }
  useEffect(() => {
    if (!primaryAction) return
    const cancel = () => { if (origin.current) suppressClick.current = true; cancelHold() }
    window.addEventListener('blur', cancel)
    document.addEventListener('visibilitychange', cancel)
    return () => { cancelHold(); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', cancel) }
  }, [!!primaryAction])
  useEffect(() => { if (primaryAction?.disabled) { cancelHold(); setOpen(false) } }, [primaryAction?.disabled])
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return
    const anchor = trigger.current.getBoundingClientRect(), bounds = menu.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 8))
    const top = anchor.bottom + bounds.height + 4 <= window.innerHeight - 8 ? anchor.bottom + 4 : Math.max(8, anchor.top - bounds.height - 4)
    setPosition({ left, top })
  }, [open])
  useEffect(() => {
    if (!open) return
    const buttons = menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    buttons?.[initial.current === 'first' ? 0 : buttons.length - 1]?.focus()
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false)
    }
    const dismiss = () => setOpen(false)
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('resize', dismiss)
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('resize', dismiss) }
  }, [open])
  return <div ref={root} className="relative shrink-0">
    <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      disabled={primaryAction?.disabled} title={primaryAction?.title}
      className={primaryAction?.className ?? 'h-9 px-3 inline-flex items-center gap-2 whitespace-nowrap rounded bg-gray-700 text-xs font-medium text-gray-100 hover:bg-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400'}
      onPointerDown={event => {
        if (!primaryAction || event.button !== 0) return
        cancelHold(); suppressClick.current = false; origin.current = { x: event.clientX, y: event.clientY }
        event.currentTarget.setPointerCapture(event.pointerId)
        timer.current = setTimeout(() => { timer.current = null; suppressClick.current = true; initial.current = 'first'; setOpen(true) }, 400)
      }}
      onPointerMove={event => {
        if (origin.current && Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 6) { suppressClick.current = true; cancelHold() }
      }}
      onPointerUp={cancelHold}
      onPointerCancel={() => { suppressClick.current = true; cancelHold() }}
      onLostPointerCapture={() => { if (origin.current) suppressClick.current = true; cancelHold() }}
      onBlur={() => { if (origin.current) suppressClick.current = true; cancelHold() }}
      onContextMenu={event => { if (primaryAction) { event.preventDefault(); cancelHold(); suppressClick.current = true; setOpen(true) } }}
      onClick={() => {
        if (suppressClick.current) { suppressClick.current = false; return }
        if (primaryAction) { setOpen(false); primaryAction.onSelect(); return }
        initial.current = 'first'; setOpen(value => !value)
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') { suppressClick.current = true; cancelHold(); setOpen(false) }
        if (event.key === 'Enter' || event.key === ' ') suppressClick.current = false
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'F10' && event.shiftKey) {
          event.preventDefault(); event.stopPropagation(); initial.current = event.key === 'ArrowUp' ? 'last' : 'first'; setOpen(true)
        }
      }}>{label}<svg className="inline ml-1" aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"><path d="m2 4 3 3 3-3" /></svg></button>
    {open && createPortal(<div id={id} ref={menu} role="menu" aria-label={`${label} actions`} style={position}
      className="fixed z-[9999] w-72 max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)] overflow-y-auto rounded-lg border border-gray-600 bg-gray-900 py-1.5 shadow-2xl"
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
      {status && <p className="mx-3 mt-2 border-t border-gray-700 pt-2 pb-1 text-[11px] leading-relaxed text-gray-400 whitespace-pre-line break-words" role="status">{status}</p>}
    </div>, document.body)}
  </div>
}
