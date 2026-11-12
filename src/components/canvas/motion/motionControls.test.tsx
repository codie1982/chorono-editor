import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TrajectoryNode } from '@/lib/timeline/trajectory'
import { MotionKeyToolbar } from './MotionKeyToolbar'
import { MotionDrawingPanel } from './MotionDrawingPanel'
import { MotionKeyInspector } from './MotionKeyInspector'
import { isMotionNodeSelected, selectMotionNode, trajectoryNodeRef } from './types'

const node: TrajectoryNode = { id: 'node', timeMs: 250, world: { x: 80, y: 150 }, local: { x: 50, y: 100 }, keyIds: ['x', 'y'],
  xKey: { id: 'x', target: 'layers.hero.transform.x', timeMs: 250, value: 50 },
  yKey: { id: 'y', target: 'layers.hero.transform.y', timeMs: 250, value: 100 } }

describe('motion key control contracts', () => {
  it('pairs sparse/partial native selection without replacing an already selected group', () => {
    const prior = new Set(['other', 'x'])
    expect(isMotionNodeSelected(node, prior)).toBe(true)
    expect(selectMotionNode(prior, node, false)).toEqual(new Set(['other', 'x', 'y']))
    expect(selectMotionNode(prior, node, true)).toEqual(new Set(['other', 'x', 'y']))
    expect(selectMotionNode(new Set(['other', 'x', 'y']), node, true)).toEqual(new Set(['other']))
    expect(selectMotionNode(new Set(['other']), node, false)).toEqual(new Set(['x', 'y']))
    expect(prior).toEqual(new Set(['other', 'x']))
    expect(trajectoryNodeRef(node)).toEqual({ timeMs: 250, xKeyId: 'x', yKeyId: 'y' })
  })

  it('publishes named modes, explicit timeline scope and disabled read-only source actions', () => {
    const html = renderToStaticMarkup(<MotionKeyToolbar mode="select" timelineId="intro" selectedCount={2} editable={false}
      duplicateMs={50} onModeChange={() => {}} onDuplicateMs={() => {}} onDuplicate={() => {}} onDelete={() => {}} />)
    expect(html).toContain('aria-label="Motion keys"')
    expect(html).toContain('intro')
    expect(html).toContain('2 selected')
    expect(html).toMatch(/aria-label="Add position key"[^>]*disabled=""/)
    expect(html).toMatch(/disabled=""[^>]*>Delete keys/)
    expect(html).toContain('aria-pressed="true"')
  })

  it('offers explicit preview timing/scope, bounded points and separate Apply/Cancel', () => {
    const html = renderToStaticMarkup(<MotionDrawingPanel pointCount={3} durationMs={1000} canApply={true}
      settings={{ startMs: 100, endMs: 900, distribution: 'distance', mode: 'replace-range' }}
      onChange={() => {}} onApply={() => {}} onClear={() => {}} onCancel={() => {}} />)
    expect(html).toContain('3/128 points')
    expect(html).toContain('aria-label="Draw motion Start ms"')
    expect(html).toContain('aria-label="Draw motion End ms"')
    expect(html).toContain('<option value="distance" selected="">By distance</option>')
    expect(html).toContain('<option value="replace-range" selected="">Replace start–end range</option>')
    expect(html).toContain('Apply route'); expect(html).toContain('Cancel route')
  })

  it('exposes world-position and bounded local-time inputs as a drag alternative', () => {
    const html = renderToStaticMarkup(<MotionKeyInspector node={node} durationMs={1000} disabled={false} onApply={() => {}} />)
    expect(html).toContain('aria-label="Motion key World X"')
    expect(html).toContain('aria-label="Motion key World Y"')
    expect(html).toMatch(/aria-label="Motion key Time \(ms\)"[^>]*min="0"[^>]*max="1000"/)
    expect(html).toContain('Apply key values')
  })
})
