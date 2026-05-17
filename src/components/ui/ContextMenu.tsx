'use client'
import {
  useEffect, useRef, useState, useCallback, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

// ── Menu item types ─────────────────────────────────────────────────────────
//
// A flat declarative model that mirrors what most editors expose right-click:
//
//   • action     — a clickable row that fires an onSelect callback
//   • separator  — a thin divider line, no interaction
//   • submenu    — opens a nested menu when hovered / activated
//
// All items can be `disabled` (greyed-out, non-clickable) so we can show the
// shape of available commands even when context doesn't permit them.

export interface MenuActionItem {
  kind:      'action'
  label:     string
  shortcut?: string                  // e.g. '⌘D' — shown right-aligned
  disabled?: boolean
  /** Optional small leading icon — anything renderable. */
  icon?:     ReactNode
  onSelect:  () => void
}

export interface MenuSeparatorItem { kind: 'separator' }

export interface MenuSubmenuItem {
  kind:      'submenu'
  label:     string
  disabled?: boolean
  items:     MenuItem[]
}

export type MenuItem = MenuActionItem | MenuSeparatorItem | MenuSubmenuItem

// ── Public component ────────────────────────────────────────────────────────

interface ContextMenuProps {
  /** Viewport coords from the pointer event. */
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

/**
 * Floating, multi-level context menu. Portalled into document.body so it
 * escapes any ancestor `transform` (which would otherwise make
 * `position:fixed` behave like `position:absolute` — the SceneCanvas pan
 * wrapper hits exactly this trap).
 *
 *   • Esc closes
 *   • Click outside closes
 *   • Action selection → onSelect() then onClose()
 *   • Submenus open on hover (with a short close-delay so the user can
 *     reach the submenu without it closing on transit) and on click
 */
export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  // Render nothing during SSR / before document is available
  if (typeof document === 'undefined') return null
  return createPortal(
    <MenuLayer x={x} y={y} items={items} onClose={onClose} root />,
    document.body,
  )
}

// ── Internal layer (recursive for submenus) ─────────────────────────────────

interface LayerProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
  /** True only for the outermost menu — drives the global click/escape listeners. */
  root?: boolean
  /** Provided by a parent MenuLayer to its child submenu. The child calls
   *  this on mouse-enter so the parent's pending close-timer is cancelled
   *  (cursor crossed the gap and landed safely in the submenu). */
  cancelParentClose?:   () => void
  /** Provided by a parent MenuLayer to its child submenu. The child calls
   *  this on mouse-leave so the parent re-arms its close timer (cursor
   *  left the submenu — close after the standard delay unless re-entered). */
  scheduleParentClose?: () => void
}

const SUBMENU_CLOSE_DELAY_MS = 220   // long enough to cross the gap to submenu

function MenuLayer({
  x, y, items, onClose, root, cancelParentClose, scheduleParentClose,
}: LayerProps) {
  const ref = useRef<HTMLDivElement>(null)
  /** Which submenu item is currently expanded (by index in `items`). */
  const [openSub, setOpenSub] = useState<number | null>(null)
  /** Submenu anchor rect — used to position the sub-menu next to the parent row. */
  const [subAnchor, setSubAnchor] = useState<DOMRect | null>(null)
  /** Adjusted position after flip-on-overflow measurement. */
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y })
  /** Pending close timer for the currently-open submenu (cleared if the user
   *  re-enters the parent row OR enters the submenu itself). Lets the cursor
   *  travel through the gap between parent row and submenu without losing it. */
  const closeTimer = useRef<number | null>(null)

  const cancelClose = useCallback(() => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  /** Schedule our own pending submenu-close (idempotent). Exposed so the
   *  CHILD submenu can call back into us on its own mouse-leave. */
  const scheduleClose = useCallback(() => {
    if (closeTimer.current != null) return
    closeTimer.current = window.setTimeout(() => {
      setOpenSub(null)
      closeTimer.current = null
    }, SUBMENU_CLOSE_DELAY_MS)
  }, [])

  // ── Flip if the menu would clip the viewport edge ────────────────────────
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r  = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = x, top = y
    if (left + r.width  > vw - 4) left = Math.max(4, vw - r.width  - 4)
    if (top  + r.height > vh - 4) top  = Math.max(4, vh - r.height - 4)
    setPos({ left, top })
  }, [x, y])

  // ── Global listeners (root only): click-outside + Escape ─────────────────
  useEffect(() => {
    if (!root) return
    const onDown = (e: MouseEvent) => {
      // Walk both the parent menu DOM and any open submenu's DOM. Because
      // submenus are sibling MenuLayers we can't use ref.contains alone —
      // delegate to the data-attribute walk.
      if (!isInsideAnyMenu(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('contextmenu', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('contextmenu', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [root, onClose])

  // Clean up timer on unmount
  useEffect(() => cancelClose, [cancelClose])

  const handleEnter = (i: number, item: MenuItem, rowEl: HTMLElement) => {
    cancelClose()
    if (item.kind === 'submenu' && !item.disabled) {
      setOpenSub(i)
      setSubAnchor(rowEl.getBoundingClientRect())
    } else if (item.kind === 'action') {
      // Hovering an action row schedules the currently-open submenu to
      // close — but only after a short delay so transit through this row
      // on the way to the submenu doesn't immediately dismiss it.
      if (openSub != null) scheduleClose()
    }
  }

  /** Layer-level mouse-enter: kill any pending close on OUR own timer AND
   *  on the parent's timer. The latter matters because when the cursor
   *  travels parent-row → gap → submenu-layer, the PARENT had scheduled
   *  the submenu's close on its leave; we need to cancel that. */
  const handleEnterLayer = () => {
    cancelClose()
    cancelParentClose?.()
  }

  const handleLeaveLayer = () => {
    // Leaving the entire layer queues OUR own pending submenu close.
    if (openSub != null) scheduleClose()
    // Also tell the parent to re-arm its close timer — if the cursor is
    // now floating away from the entire menu tree, parent will fire after
    // the delay; if it re-enters the parent / grandparent, that enter
    // will cancel via handleEnterLayer.
    scheduleParentClose?.()
  }

  return (
    <>
      <div
        ref={ref}
        role="menu"
        data-context-menu="true"
        className="fixed z-[9999] min-w-[220px] py-1 rounded-md
                   bg-gray-900 border border-gray-700 shadow-2xl text-gray-200
                   select-none"
        style={{ left: pos.left, top: pos.top }}
        onContextMenu={(e) => e.preventDefault()}
        onMouseLeave={handleLeaveLayer}
        onMouseEnter={handleEnterLayer}
      >
        {items.map((item, i) => {
          if (item.kind === 'separator') {
            return <div key={`sep-${i}`} className="my-1 h-px bg-gray-800" />
          }
          const isOpen = openSub === i
          return (
            <Row
              key={`row-${i}-${item.label}`}
              item={item}
              isOpen={isOpen}
              onEnter={(e) => handleEnter(i, item, e.currentTarget as HTMLElement)}
              onActivate={() => {
                if (item.kind === 'action' && !item.disabled) {
                  item.onSelect()
                  onClose()
                } else if (item.kind === 'submenu' && !item.disabled) {
                  // Click → toggle the submenu (helps with touch / keyboard)
                  setOpenSub(isOpen ? null : i)
                }
              }}
            />
          )
        })}
      </div>

      {/* Submenu — sibling layer so it can overflow the parent rect. We
          pass root=false so it doesn't double-bind the global listeners.
          cancelParentClose / scheduleParentClose let the submenu keep OUR
          (parent's) timer alive while the cursor sits inside it; otherwise
          a stray parent-leave would close the submenu out from under the
          cursor mid-transit. */}
      {openSub != null && subAnchor && items[openSub].kind === 'submenu' && (
        <MenuLayer
          x={subAnchor.right - 2}
          y={subAnchor.top}
          items={(items[openSub] as MenuSubmenuItem).items}
          onClose={onClose}
          cancelParentClose={cancelClose}
          scheduleParentClose={scheduleClose}
        />
      )}
    </>
  )
}

// ── Single row ──────────────────────────────────────────────────────────────

function Row({ item, isOpen, onEnter, onActivate }: {
  item:       MenuActionItem | MenuSubmenuItem
  isOpen:     boolean
  onEnter:    (e: React.MouseEvent<HTMLDivElement>) => void
  onActivate: () => void
}) {
  const disabled = item.disabled === true
  // Theme: idle = gray-200 text on transparent; hover/active = white on blue-600.
  // Disabled rows: gray-600 with no hover effect. Matches the rest of the
  // app's menu styling (FileMenu / SnapMenu) without the all-blue tint.
  const rowClass = disabled
    ? 'text-gray-600 cursor-default'
    : isOpen
      ? 'bg-blue-600 text-white cursor-default'
      : 'text-gray-200 cursor-default hover:bg-blue-600 hover:text-white'

  return (
    <div
      role="menuitem"
      aria-disabled={disabled}
      className={`group flex items-center gap-2 px-3 py-1 text-[13px] ${rowClass}`}
      onMouseEnter={onEnter}
      onClick={(e) => { if (!disabled) { e.stopPropagation(); onActivate() } }}
    >
      {'icon' in item && item.icon ? <span className="w-4 text-center">{item.icon}</span> : null}
      <span className="flex-1 truncate">{item.label}</span>
      {item.kind === 'action' && item.shortcut
        ? <span className={`text-[11px] font-mono tabular-nums
              ${disabled
                ? 'text-gray-700'
                : isOpen ? 'text-blue-100' : 'text-gray-500 group-hover:text-blue-100'}`}>
            {item.shortcut}
          </span>
        : null}
      {item.kind === 'submenu'
        ? <span className={`text-[10px] ${disabled ? 'text-gray-700' : 'text-gray-400 group-hover:text-white'}`}>▶</span>
        : null}
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** A click anywhere inside ANY context-menu DOM tree (parent or any submenu)
 *  counts as "inside" — submenus are sibling portals so we can't use parent
 *  containment, we walk by data attribute instead. */
function isInsideAnyMenu(node: Node | null): boolean {
  let n: Node | null = node
  while (n) {
    if (n instanceof HTMLElement && n.dataset.contextMenu === 'true') return true
    n = n.parentNode
  }
  return false
}

// ── Convenience hook ────────────────────────────────────────────────────────

/**
 * Tiny helper for components that need to open a context menu in response
 * to a `onContextMenu` event. Manages position + open state in one tidy call.
 */
export function useContextMenu() {
  const [state, setState] = useState<{ x: number; y: number } | null>(null)
  const open = useCallback((e: { clientX: number; clientY: number; preventDefault?: () => void }) => {
    e.preventDefault?.()
    setState({ x: e.clientX, y: e.clientY })
  }, [])
  const close = useCallback(() => setState(null), [])
  return { state, open, close, isOpen: state != null }
}
