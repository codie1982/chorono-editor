import { describe, expect, it, vi } from 'vitest'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import { evaluateTimelines } from '@/lib/evaluator'
import { prepareTransformTargets } from '@/lib/canvas/math/preparedTransforms'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import type { ChronoScene, Layer } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { MoveState } from '../../types/canvasDragTypes'
import { prepareCloneDrag, previewCloneDrag } from './cloneDragPreview'
import { previewTransformDrag } from './transformDragPreview'
import { commitCanvasDrag } from './commitCanvasDrag'

/** Real evaluated root under reflected/nonuniform parent; authored x=0 while
 * the displayed x=100 at 500 ms catches the former fallback subtraction bug. */
function fixture() {
  const parent: Layer = { ...newRectLayer(), id: 'parent', type: 'group',
    transform: { x: 300, y: 250, scaleX: -2, scaleY: 3, rotationDeg: 90, anchorX: 0, anchorY: 0 } }
  const hero: Layer = { ...newRectLayer(), id: 'hero', parentId: parent.id,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 } }
  const child: Layer = { ...newRectLayer(), id: 'child', parentId: hero.id }
  const base: ChronoScene = { ...emptyScene(), layers: [parent, hero, child], timelines: [
    { id: 'main', durationMs: 1000, loop: false, autoplay: false, layerIds: [hero.id, child.id], tracks: [
      { target: 'layers.hero.transform.x', keyframes: [
        { id: 'x0', timeMs: 0, value: 50, easing: { type: 'linear' } },
        { id: 'x1', timeMs: 1000, value: 150, easing: { type: 'easeOut' }, tangentMode: 'broken' },
      ] },
    ] },
    { id: 'other', durationMs: 1000, loop: false, autoplay: false, tracks: [
      { target: 'layers.child.opacity', keyframes: [{ id: 'child-key', timeMs: 0, value: 0.5, easing: { type: 'hold' } }] },
    ] },
  ] }
  const prepared = prepareTransformTargets(base, ['hero', 'child'], 500)
  if (!prepared.ok) throw new Error(prepared.reason)
  const drag: MoveState = { kind: 'move', layerId: hero.id, originalLayer: hero,
    movingLayers: [], targets: prepared.targets, startClientX: 0, startClientY: 0,
    width: 60, height: 40, cloneMode: 'copy' }
  return { base, hero, drag }
}

const pointer = (x: number, y: number) => ({ pointerId: 1, clientX: x, clientY: y,
  ctrlKey: true, metaKey: false, shiftKey: false })

/** Reuse normal snap/transform projection before the copy adapter. */
function moved(base: ChronoScene, drag: MoveState, x: number, y: number) {
  return previewTransformDrag({ base, drag, event: pointer(x, y), delta: { x, y }, pointerWorld: { x, y },
    dimensions: { width: 1000, height: 1000 }, bounds: { moving: null, others: [] }, engine: null })
}

describe('native forest drag preview and commit adapter', () => {
  it('keeps source visible, copies all timeline keys and preserves parent-local placement at an animated midpoint', () => {
    const { base, hero, drag } = fixture(), plan = prepareCloneDrag(base, drag)
    const preview = previewCloneDrag(base, drag, plan, moved(base, drag, 30, 20), pointer(30, 20))
    expect(preview.scene.layers.slice(0, 3)).toEqual(base.layers)
    expect(preview.scene.layers[1]).toBe(hero)
    expect(preview.overrides.size).toBe(0)
    const command = preview.cloneCommand!, clone = preview.scene.layers.find(layer => layer.id === command.result.suggestedSelection[0])!
    expect(clone.parentId).toBe('parent')
    const frame = evaluateTimelines(preview.scene.timelines, 500)
    const before = resolveLayerWorldMatrix(hero, preview.scene, 500, frame).applyToPoint({ x: 0, y: 0 })
    const after = resolveLayerWorldMatrix(clone, preview.scene, 500, frame).applyToPoint({ x: 0, y: 0 })
    expect(after.x - before.x).toBeCloseTo(30)
    expect(after.y - before.y).toBeCloseTo(20)
    expect(preview.scene.timelines[0].tracks).toHaveLength(2)
    expect(preview.scene.timelines[1].tracks).toHaveLength(2)
    expect(preview.scene.timelines[0].tracks[1].keyframes[1].easing).toEqual(base.timelines[0].tracks[0].keyframes[1].easing)
    expect(preview.scene.timelines[0].tracks[1].keyframes[1].id).not.toBe('x1')
    expect(command.undo(preview.scene)).toEqual(base)
    expect(command.execute(command.undo(preview.scene))).toEqual(preview.scene)
  })

  it('does not append a clone below threshold and reserves the same IDs for every real preview and commit', () => {
    const { base, drag } = fixture(), plan = prepareCloneDrag(base, drag)
    const small = previewCloneDrag(base, drag, plan, moved(base, drag, 1, 0), pointer(1, 0))
    expect(small.scene).toBe(base); expect(small.cloneCommand).toBeUndefined()
    expect(small.changes).toEqual([])
    const first = previewCloneDrag(base, drag, plan, moved(base, drag, 10, 0), pointer(10, 0))
    const final = previewCloneDrag(base, drag, plan, moved(base, drag, 35, 12), pointer(35, 12))
    expect(first.cloneCommand!.result.createdLayerIds).toEqual(final.cloneCommand!.result.createdLayerIds)
    expect(first.scene.timelines[0].tracks[1].keyframes.map(key => key.id))
      .toEqual(final.scene.timelines[0].tracks[1].keyframes.map(key => key.id))
    const commit = vi.fn(), select = vi.fn(), selectMany = vi.fn()
    commitCanvasDrag({ commitTransaction: commit } as unknown as EditorStateReturn, base, drag, final,
      { onSelectLayer: select, onSelectLayers: selectMany })
    expect(commit).toHaveBeenCalledExactlyOnceWith(final.cloneCommand)
    expect(selectMany).toHaveBeenCalledWith(final.cloneCommand!.result.suggestedSelection)
    expect(select).not.toHaveBeenCalled()
  })
})
