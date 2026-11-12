'use client'
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import type { RowLayout } from '@/lib/editor/virtualization/RowLayout'

// Server rendering has no focus target; avoid React's layout-effect warning.
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

interface Viewport { top: number; height: number; width: number; left: number; offset: number }
const INITIAL: Viewport = { top: 0, height: 300, width: 800, left: 0, offset: 0 }

/**
 * Browser adapter for immutable row layouts. Owns one RAF-coalesced scroll /
 * resize subscription and keeps at most the focused, pressed and native-drag
 * row alive outside overscan. No selected-row expansion or per-playhead timer.
 * The optional content origin accounts for rulers/filter strips/padding.
 * All listeners, observers and RAF callbacks are removed on unmount.
 */
export function useRowWindow(layout: RowLayout, keys: readonly string[],
  scrollRef: RefObject<HTMLElement>, contentRef?: RefObject<HTMLElement>,
  canFocusRow?: (index: number) => boolean) {
  const [viewport, setViewport] = useState(INITIAL)
  const [owners, setOwners] = useState({ focus: '', pointer: '', drag: '' })
  const [pendingFocus, setPendingFocus] = useState<{ key: string; backwards: boolean } | null>(null)
  const byKey = useMemo(() => new Map(keys.map((key, i) => [key, i])), [keys])

  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    let frame = 0
    const measure = () => {
      frame = 0
      const content = contentRef?.current
      const offset = content ? content.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop : 0
      const next = { top: scroll.scrollTop - offset, height: scroll.clientHeight,
        width: scroll.clientWidth, left: scroll.scrollLeft, offset }
      setViewport(previous => Object.keys(next).every(key => previous[key as keyof Viewport] === next[key as keyof Viewport]) ? previous : next)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
    const rowOf = (target: EventTarget | null): string => {
      let row = target instanceof Element ? target.closest<HTMLElement>('[data-virtual-row]') : null
      while (row && scroll.contains(row)) {
        if (byKey.has(row.dataset.virtualRow!)) return row.dataset.virtualRow!
        row = row.parentElement?.closest<HTMLElement>('[data-virtual-row]') ?? null
      }
      return ''
    }
    const focus = (event: FocusEvent) => setOwners(previous => ({ ...previous, focus: rowOf(event.target) }))
    const blur = (event: FocusEvent) => setOwners(previous => ({ ...previous, focus: rowOf(event.relatedTarget) }))
    const pointer = (event: PointerEvent) => setOwners(previous => ({ ...previous, pointer: rowOf(event.target) }))
    const releasePointer = () => setOwners(previous => previous.pointer ? { ...previous, pointer: '' } : previous)
    const drag = (event: DragEvent) => setOwners(previous => ({ ...previous, drag: rowOf(event.target) }))
    const releaseDrag = () => setOwners(previous => previous.drag ? { ...previous, drag: '' } : previous)
    // Native Tab cannot reach an unmounted next row. Bridge just that boundary;
    // normal controls within mounted rows keep their browser behavior.
    const tab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return
      const key = rowOf(event.target), index = byKey.get(key)
      if (index === undefined) return
      const nodes = Array.from(scroll.querySelectorAll<HTMLElement>('[data-virtual-row]'))
      const row = nodes.find(node => node.dataset.virtualRow === key && node.contains(event.target as Node))
      const controls = row ? focusable(row) : []
      if (event.target !== (event.shiftKey ? controls[0] : controls[controls.length - 1])) return
      const direction = event.shiftKey ? -1 : 1
      let next = index + direction
      while (next >= 0 && next < keys.length && canFocusRow && !canFocusRow(next)) next += direction
      if (next < 0 || next >= keys.length || nodes.some(node => node.dataset.virtualRow === keys[next])) return
      event.preventDefault()
      setPendingFocus({ key: keys[next], backwards: event.shiftKey })
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(scroll)
    if (contentRef?.current) observer.observe(contentRef.current)
    scroll.addEventListener('scroll', schedule, { passive: true })
    scroll.addEventListener('focusin', focus); scroll.addEventListener('focusout', blur)
    scroll.addEventListener('pointerdown', pointer, true); scroll.addEventListener('dragstart', drag, true)
    scroll.addEventListener('keydown', tab)
    window.addEventListener('pointerup', releasePointer); window.addEventListener('pointercancel', releasePointer)
    window.addEventListener('dragend', releaseDrag); window.addEventListener('drop', releaseDrag)
    measure()
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame)
      scroll.removeEventListener('scroll', schedule)
      scroll.removeEventListener('focusin', focus); scroll.removeEventListener('focusout', blur)
      scroll.removeEventListener('pointerdown', pointer, true); scroll.removeEventListener('dragstart', drag, true)
      scroll.removeEventListener('keydown', tab)
      window.removeEventListener('pointerup', releasePointer); window.removeEventListener('pointercancel', releasePointer)
      window.removeEventListener('dragend', releaseDrag); window.removeEventListener('drop', releaseDrag)
    }
  }, [scrollRef, contentRef, byKey, keys, canFocusRow, layout])

  const range = layout.range(viewport.top, viewport.height)
  const retained = [...Object.values(owners), pendingFocus?.key ?? ''].map(key => byKey.get(key) ?? -1)
  const indices = layout.indices(range, retained)
  /** Scroll a data row into view after an explicit selection/navigation change.
   * Returns false until both the row and a visible viewport exist, so callers
   * can retry after expanding ancestors or opening a dock. No focus is stolen
   * and playhead ticks must not call this operation. */
  const reveal = useCallback((index: number) => {
    const scroll = scrollRef.current
    if (!scroll || scroll.clientHeight <= 0 || index < 0 || index >= layout.count) return false
    const content = contentRef?.current
    const offset = content ? content.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop : viewport.offset
    const top = layout.top(index) + offset, bottom = layout.top(index + 1) + offset
    if (top < scroll.scrollTop || bottom - top > scroll.clientHeight) scroll.scrollTop = top
    else if (bottom > scroll.scrollTop + scroll.clientHeight) scroll.scrollTop = bottom - scroll.clientHeight
    return true
  }, [layout, scrollRef, contentRef, viewport.offset])
  // Retained rows are already mounted in this commit. Resolve focus before
  // paint; a deferred RAF can be repeatedly cancelled by fast arrow/key-repeat
  // requests and leave every event navigating from the original row.
  useBrowserLayoutEffect(() => {
    if (!pendingFocus) return
    const scroll = scrollRef.current
    const row = Array.from(scroll?.querySelectorAll<HTMLElement>('[data-virtual-row]') ?? [])
      .find(node => node.dataset.virtualRow === pendingFocus.key)
    const controls = row ? focusable(row) : []
    const target = pendingFocus.backwards ? controls[controls.length - 1] : controls[0]
    reveal(byKey.get(pendingFocus.key) ?? -1)
    target?.focus({ preventScroll: true })
    setPendingFocus(null)
  }, [pendingFocus, byKey, reveal, scrollRef])
  /** Keyboard-only navigation can mount/focus a data row across virtual gaps.
   * Automatic external selection uses reveal() and never invokes this. */
  const focusKey = useCallback((key: string) => { if (byKey.has(key)) setPendingFocus({ key, backwards: false }) }, [byKey])
  const focus = useCallback((index: number) => { if (index >= 0 && index < keys.length) focusKey(keys[index]) }, [keys, focusKey])
  return { indices, range, viewport, reveal, focus, focusKey }
}

/** Native sequential-focus candidates, queried only at a keyboard boundary. */
function focusable(row: HTMLElement): HTMLElement[] {
  const selector = 'button,input,select,textarea,a[href],[tabindex]'
  return [row, ...Array.from(row.querySelectorAll<HTMLElement>(selector))].filter(node => node.matches(selector))
    .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && node.getClientRects().length > 0)
}
