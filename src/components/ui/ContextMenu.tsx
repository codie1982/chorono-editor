'use client'
import {
  useEffect, useRef, useState, useCallback, type ReactNode,
} from 'react'

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
  /** Page-relative position (clientX/Y from the pointer event). */
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

/**
 * Floating, multi-level context menu. Positions itself near the pointer and
 * flips to the opposite side of the viewport edge if it would overflow.
 *
 *   • Esc closes
 *   • Click outside closes
 *   • Action selection → onSelect() then onClose()
 *   • Submenus open on hover OR click; nested viewports flip the same way.
 */
export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  return (
    <MenuLayer x={x} y={y} items={items} onClose={onClose} root />
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
}

function MenuLayer({ x, y, items, onClose, root }: LayerProps) {
  const ref = useRef<HTMLDivElement>(null)
  /** Which submenu item is currently expanded (by index in `items`). */
  const [openSub, setOpenSub] = useState<number | null>(null)
  /** Submenu anchor rect — used to position the sub-menu next to the parent row. */
  const [subAnchor, setSubAnchor] = useState<DOMRect | null>(null)
  /** Adjusted position after flip-on-overflow measurement. */
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y })

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
      const el = ref.current
      // Click outside the entire menu tree — close everything.
      if (el && !el.contains(e.target as Node) && !isInsideSubmenu(e.target as Node)) {
        onClose()
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    // Mousedown rather than click so we catch right-click dismiss too
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('contextmenu', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('contextmenu', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [root, onClose])

  const handleHover = (i: number, item: MenuItem, e: React.MouseEvent) => {
    if (item.kind === 'submenu' && !item.disabled) {
      setOpenSub(i)
      setSubAnchor((e.currentTarget as HTMLElement).getBoundingClientRect())
    } else {
      // Hovering a non-submenu row closes any open sibling submenu so we
      // don't show two trails at once.
      setOpenSub(null)
    }
  }

  return (
    <>
      <div
        ref={ref}
        role="menu"
        data-context-menu="true"
        className="fixed z-[9999] min-w-[220px] py-1 rounded-md
                   bg-neutral-900 border border-neutral-700 shadow-xl text-gray-200
                   select-none"
        style={{ left: pos.left, top: pos.top }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((item, i) => {
          if (item.kind === 'separator') {
            return <div key={`sep-${i}`} className="my-1 h-px bg-neutral-800" />
          }
          const isOpen = openSub === i
          return (
            <Row
              key={`row-${i}-${item.label}`}
              item={item}
              isOpen={isOpen}
              onHover={(e) => handleHover(i, item, e)}
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

      {/* Submenu — rendered as a sibling layer so it can overflow the parent
          rect. We pass root=false so it doesn't double-bind the global listeners. */}
      {openSub != null && subAnchor && items[openSub].kind === 'submenu' && (
        <MenuLayer
          x={subAnchor.right - 2}
          y={subAnchor.top}
          items={(items[openSub] as MenuSubmenuItem).items}
          onClose={onClose}
        />
      )}
    </>
  )
}

// ── Single row ──────────────────────────────────────────────────────────────

function Row({ item, isOpen, onHover, onActivate }: {
  item:       MenuActionItem | MenuSubmenuItem
  isOpen:     boolean
  onHover:    (e: React.MouseEvent) => void
  onActivate: () => void
}) {
  const disabled = item.disabled === true
  return (
    <div
      role="menuitem"
      aria-disabled={disabled}
      className={`flex items-center gap-2 px-3 py-1 text-[13px] cursor-default
        ${disabled
          ? 'text-gray-600'
          : isOpen
            ? 'bg-blue-600 text-white'
            : 'text-gray-200 hover:bg-blue-600 hover:text-white'}`}
      onMouseEnter={onHover}
      onClick={(e) => { if (!disabled) { e.stopPropagation(); onActivate() } }}
    >
      {'icon' in item && item.icon ? <span className="w-4 text-center">{item.icon}</span> : null}
      <span className="flex-1 truncate">{item.label}</span>
      {item.kind === 'action' && item.shortcut
        ? <span className={`text-[11px] font-mono tabular-nums
              ${disabled ? 'text-gray-700' : 'text-gray-500 group-hover:text-gray-300'}`}>
            {item.shortcut}
          </span>
        : null}
      {item.kind === 'submenu'
        ? <span className="text-[10px] text-gray-400">▶</span>
        : null}
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** A click anywhere on a context menu tree should NOT count as "outside". */
function isInsideSubmenu(node: Node | null): boolean {
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
