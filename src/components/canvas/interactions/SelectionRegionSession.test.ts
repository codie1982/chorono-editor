import { describe, expect, it, vi } from 'vitest'
import { SelectionRegionSession } from './SelectionRegionSession'
import type { SelectionRegionStyle, SelectionMode, SelectionRegion } from '@/lib/selection/selectionGesture'

/** Native EventTarget lifecycle with deterministic world conversion; geometry
 * queries are the isolated collaborator, covered by canvasShapes tests. */
function fixture(style: SelectionRegionStyle = 'box', mode: SelectionMode = 'replace') {
  const events = new EventTarget(), show = vi.fn(), select = vi.fn(), closed = vi.fn()
  const query = vi.fn((region: SelectionRegion) => new Set([region.kind])), current = { value: true }
  const session = new SelectionRegionSession({ x: 10, y: 20 }, style, mode, {
    eventTarget: events as unknown as Window, world: point => ({ x: point.x * 2, y: point.y * 2 }),
    current: () => current.value, query, show, select, closed,
  })
  const emit = (type: string, x: number, y: number, pointerId = 1, buttons = type === 'pointerup' ? 0 : 1) => {
    const event = Object.assign(new Event(type, { cancelable: true }), { pointerId, clientX: x, clientY: y, buttons, shiftKey: false, metaKey: false, ctrlKey: false })
    events.dispatchEvent(event); return event
  }
  return { events, session, show, select, closed, query, emit, current }
}

describe('empty-space region gesture ownership', () => {
  it('distinguishes a blank click from a region at a zoom-independent CSS threshold', () => {
    const click = fixture(); click.emit('pointermove', 11, 20); expect(click.show).not.toHaveBeenCalled()
    click.emit('pointerup', 11, 20)
    expect(click.select).toHaveBeenCalledExactlyOnceWith(new Set(), 'replace')
    const additive = fixture('box', 'add'); additive.emit('pointerup', 10, 20); expect(additive.select).not.toHaveBeenCalled()
    const drag = fixture(); drag.emit('pointermove', 14, 25); drag.emit('pointerup', 30, 40)
    expect(drag.query).toHaveBeenLastCalledWith({ kind: 'box', x: 20, y: 40, w: 40, h: 40 })
    expect(drag.select).toHaveBeenCalledExactlyOnceWith(new Set(['box']), 'replace')
  })
  it.each(['circle', 'lasso', 'paint'] as const)('resamples the final %s release', style => {
    const h = fixture(style); h.emit('pointermove', 20, 20); h.emit('pointermove', 20, 30); h.emit('pointerup', 21, 31)
    const region = h.query.mock.calls.at(-1)![0]
    if (region.kind === 'circle') expect(region.r).toBeCloseTo(Math.hypot(22, 22))
    if (region.kind === 'lasso') expect(region.points.at(-1)).toEqual({ x: 42, y: 62 })
    if (region.kind === 'paint') expect(region).toMatchObject({ cx: 42, cy: 62 })
    expect(h.select).toHaveBeenCalledOnce(); expect(h.closed).toHaveBeenCalledOnce()
  })
  it('ignores foreign pointers and drops Escape/stale-frame previews without applying', () => {
    const h = fixture(); h.emit('pointermove', 40, 40); h.emit('pointerup', 50, 50, 2)
    expect(h.select).not.toHaveBeenCalled()
    const event = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' })
    h.events.dispatchEvent(event); expect(event.defaultPrevented).toBe(true)
    h.emit('pointerup', 40, 40); expect(h.select).not.toHaveBeenCalled(); expect(h.closed).toHaveBeenCalledOnce()
    const stale = fixture(); stale.current.value = false; stale.emit('pointerup', 80, 80)
    expect(stale.select).not.toHaveBeenCalled(); expect(stale.closed).toHaveBeenCalledOnce()
  })
})
