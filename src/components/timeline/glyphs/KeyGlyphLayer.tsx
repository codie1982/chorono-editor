'use client'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { KeyGlyphLayout, type KeyGlyphPoint } from '@/lib/timeline/glyphs/KeyGlyphLayout'

export interface KeyGlyphAccessibility { descriptionId?: string; ordinal?: string }
interface Props {
  points: readonly KeyGlyphPoint[]; width: number; height: number; label: string; left?: number
  selected: ReadonlySet<string>; radius?: number
  palette?: readonly [string, string, string]
  renderKey(point: KeyGlyphPoint, accessibility: KeyGlyphAccessibility): ReactNode
  onPointerDown(point: KeyGlyphPoint, event: React.PointerEvent<HTMLDivElement>): void
  onSelect(point: KeyGlyphPoint, event: React.MouseEvent<HTMLDivElement>): void
  onContextMenu?(point: KeyGlyphPoint, event: React.MouseEvent<HTMLDivElement>): void
  onDoubleClick?(point: KeyGlyphPoint, event: React.MouseEvent<HTMLDivElement>): void
}
const TIMELINE_PALETTE = ['fill-yellow-400 stroke-yellow-600', 'fill-orange-200 stroke-orange-500', 'fill-orange-300 stroke-orange-500'] as const
/** Focus runs before browser paint; server rendering has no layout side effect. */
const useCommitEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect

/**
 * Bounded editor glyph adapter. Sparse rows retain native controls; dense rows
 * use three SVG paths and at most focused/hovered/drag-owner native controls.
 * Every source point remains reachable by authored-order arrows/Home/End or
 * the explicit ordinal input. Enter/Space, context/value/easing/drag callbacks
 * are the existing owner's native control, not a parallel edit implementation.
 * Browser listeners retain a grabbed control until pointerup/cancel and are
 * removed on unmount. No canvas/GPU buffer, timer loop or scene data is owned.
 */
export function KeyGlyphLayer(props: Props) {
  const layout = useMemo(() => new KeyGlyphLayout(props.points, props.width, props.height), [props.points, props.width, props.height])
  const [cursor, setCursor] = useState(''), [hover, setHover] = useState(''), [pressed, setPressed] = useState('')
  const [browse, setBrowse] = useState(false), [draft, setDraft] = useState('1')
  const root = useRef<HTMLDivElement>(null), focusRequested = useRef(false), helpId = useId()
  const first = layout.visibleAt(0)
  const active = layout.get(cursor) ?? (first ? layout.dense ? layout.representative(first) : first : undefined)
  const ordinal = active ? layout.ordinal(active.id) : -1
  const paths = useMemo(() => layout.dense ? layout.paths(props.selected, props.radius) : [], [layout, props.selected, props.radius])
  const native = layout.dense ? Array.from(new Set([active?.id, hover, pressed])).flatMap(id => id && layout.get(id) ? [layout.get(id)!] : [])
    : Array.from(new Map([...layout.visible, ...[cursor, pressed].flatMap(id => layout.get(id) ? [layout.get(id)!] : [])].map(point => [point.id, point])).values())

  useEffect(() => {
    const release = () => setPressed(previous => previous ? '' : previous)
    window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release)
    return () => { window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release) }
  }, [])
  useCommitEffect(() => {
    if (!focusRequested.current) return
    focusRequested.current = false
    const item = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-glyph-item]') ?? [])
      .find(item => item.dataset.glyphItem === active?.id)
    item?.querySelector<HTMLElement>('[data-glyph-control]')?.focus({ preventScroll: true })
  })

  /** Move the roving cursor only; selection still requires native Enter/Space
   * (or click), including the owner's existing Shift/Ctrl semantics. */
  const navigate = (index: number) => {
    const point = layout.visibleAt(index)
    if (!point) return
    focusRequested.current = true; setCursor(point.id); setHover('')
  }
  const itemOf = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>('[data-glyph-item]')?.dataset.glyphItem : undefined
  const hit = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return layout.hit(event.clientX - rect.left, event.clientY - rect.top)
  }
  const nativeTarget = (target: EventTarget | null) => target instanceof Element && !!target.closest('[data-glyph-item],[data-glyph-nav]')

  return <div ref={root} className="absolute top-0 bottom-0 [&_[data-glyph-control]:focus]:z-40" style={{ left: props.left ?? 0, width: props.width }}
    tabIndex={-1} role="group" aria-label={`${props.label} keyframes`}
    data-key-glyph-layer={layout.dense ? 'dense' : 'native'} data-glyph-count={layout.count} data-glyph-cells={layout.cellCount}
    onFocusCapture={event => { const id = itemOf(event.target); if (id) setCursor(id) }}
    onPointerDownCapture={event => { const id = itemOf(event.target); if (id) { setCursor(id); setPressed(id) } }}
    onPointerMove={event => { if (layout.dense && !pressed && !nativeTarget(event.target)) setHover(hit(event)?.id ?? '') }}
    onPointerLeave={() => { if (!pressed) setHover('') }}
    onPointerDown={event => {
      if (!layout.dense || nativeTarget(event.target)) return
      const point = hit(event)
      if (!point) return
      focusRequested.current = true; setCursor(point.id); setPressed(point.id)
      props.onPointerDown(point, event)
    }}
    onClick={event => {
      if (!layout.dense || nativeTarget(event.target)) return
      const point = hit(event)
      if (point) { event.stopPropagation(); if (!event.detail) props.onSelect(point, event) }
    }}
    onContextMenu={event => {
      if (!layout.dense || nativeTarget(event.target)) return
      const point = hit(event)
      if (point) { event.preventDefault(); event.stopPropagation(); setCursor(point.id); props.onContextMenu?.(point, event) }
    }}
    onDoubleClick={event => {
      if (!layout.dense || nativeTarget(event.target)) return
      const point = hit(event)
      if (point) { event.preventDefault(); event.stopPropagation(); setCursor(point.id); props.onDoubleClick?.(point, event) }
    }}
    onKeyDownCapture={event => {
      if (!layout.dense || pressed || event.ctrlKey || event.metaKey || event.altKey
        || !(event.target instanceof Element) || !event.target.matches('[data-glyph-control]')) return
      const index = layout.ordinal(itemOf(event.target) ?? '')
      const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? index + 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? index - 1
        : event.key === 'Home' ? 0 : event.key === 'End' ? layout.count - 1 : null
      if (next !== null) { event.preventDefault(); event.stopPropagation(); navigate(Math.max(0, Math.min(layout.count - 1, next))) }
    }}>
    {layout.dense && <>
      <span id={helpId} className="sr-only">{layout.count} visible keys. Use arrow keys, Home or End to browse, then Enter or Space to select. Browse keys accepts an exact key number.</span>
      <svg className="absolute inset-0 overflow-visible pointer-events-none" width="100%" height="100%" aria-hidden="true">
        {paths.map((path, i) => <path key={i} d={path} className={(props.palette ?? TIMELINE_PALETTE)[i]} strokeWidth={1} />)}
      </svg>
      <div data-glyph-nav className="absolute right-1 top-0 z-30 text-[9px] bg-gray-900/95 rounded border border-gray-700"
        onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
        onDoubleClick={event => event.stopPropagation()} onContextMenu={event => event.stopPropagation()}>
        {browse ? <form className="flex items-center gap-1 px-1" onSubmit={event => {
          event.preventDefault(); event.stopPropagation(); navigate(Math.round(Number(draft)) - 1); setBrowse(false)
        }} onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setBrowse(false); navigate(Math.max(0, ordinal)) }
        }}>
          <input aria-label={`Key number in ${props.label}`} type="number" min={1} max={layout.count} required value={draft}
            onChange={event => setDraft(event.target.value)} className="w-16 bg-gray-800 text-gray-200" autoFocus />
          <span>/ {layout.count}</span><button type="submit" aria-label="Go to key">Go</button>
          <button type="button" aria-label="Close key navigation" onClick={() => { setBrowse(false); navigate(Math.max(0, ordinal)) }}>×</button>
        </form> : <button type="button" aria-label={`Browse ${layout.count} keys in ${props.label}`} onClick={() => {
          setDraft(String(Math.max(0, ordinal) + 1)); setBrowse(true)
        }} className="px-1 text-gray-400 hover:text-gray-200">{layout.count} keys</button>}
      </div>
    </>}
    {native.map(point => <div key={point.id} data-glyph-item={point.id}>
      {props.renderKey(point, layout.dense ? { descriptionId: helpId, ordinal: `${layout.ordinal(point.id) + 1} of ${layout.count} visible keys` } : {})}
    </div>)}
  </div>
}
