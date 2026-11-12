import { describe, expect, it, vi } from 'vitest'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import type { ChronoScene, Layer } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { PathBounds } from '@/lib/geometry/computePathBounds'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { prepareTransformTargets } from '@/lib/canvas/math/preparedTransforms'
import { buildViewportKeyframeCommands } from '@/lib/editor/viewportKeyframes'
import type { ScaleAxisState } from '../../types/canvasDragTypes'
import { previewTransformDrag } from './transformDragPreview'
import { commitCanvasDrag } from './commitCanvasDrag'

const transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 5, anchorY: 3 }
const event = { pointerId: 1, clientX: 80, clientY: 50, shiftKey: false, ctrlKey: false, metaKey: false }
function layer(id: string, x: number, y: number, patch: Partial<Layer> = {}): Layer {
  return { ...newRectLayer(), id, size: { width: 20, height: 10 }, transform: { ...transform, x, y }, ...patch }
}
function fixture() {
  const group = layer('group', 20, 30, { type: 'group', size: undefined })
  const child = layer('child', 0, 0, { parentId: 'group' })
  const other = layer('other', 80, 70)
  return { ...emptyScene(), layers: [group, child, other] }
}
function prepare(base: ChronoScene, bounds: PathBounds, handle: NonNullable<ScaleAxisState['selectionResize']>['handle'], timeMs = 0): ScaleAxisState {
  const result = prepareTransformTargets(base, base.layers.map(value => value.id), timeMs)
  if (!result.ok) throw new Error(result.reason)
  return { kind: 'scaleAxis', layerId: result.targets[0].id, originalLayer: result.targets[0].originalLayer,
    axis: 'both', startClientX: 0, startClientY: 0, targets: result.targets, selectionResize: { bounds, handle } }
}
function preview(base: ChronoScene, drag: ScaleAxisState, x: number, y: number, modifiers = {}) {
  return previewTransformDrag({ base, drag, event: { ...event, ...modifiers }, delta: { x, y }, pointerWorld: { x, y },
    dimensions: { width: 500, height: 500 }, bounds: { moving: null, others: [] }, engine: null })
}

describe('common selection frame resize', () => {
  it('scales every independent root once around the opposite world corner and preserves child-local data', () => {
    const base = fixture(), bounds = { x: 20, y: 30, width: 80, height: 50 }
    const drag = prepare(base, bounds, 'se'), result = preview(base, drag, 80, 50)
    expect(result.changes.map(change => change.next.id)).toEqual(['group', 'other'])
    expect(result.scene.layers[1]).toBe(base.layers[1])
    for (const id of ['child', 'other']) {
      const old = base.layers.find(value => value.id === id)!, next = result.scene.layers.find(value => value.id === id)!
      const before = resolveLayerWorldMatrix(old, base).applyToPoint({ x: 0, y: 0 })
      const after = resolveLayerWorldMatrix(next, result.scene).applyToPoint({ x: 0, y: 0 })
      expect(after.x).toBeCloseTo(bounds.x + (before.x - bounds.x) * 2)
      expect(after.y).toBeCloseTo(bounds.y + (before.y - bounds.y) * 2)
    }
    for (const change of result.changes) {
      expect(change.next.transform.anchorX).toBe(change.prev.transform.anchorX)
      expect(change.next.transform.anchorY).toBe(change.prev.transform.anchorY)
      expect(change.next.size).toBe(change.prev.size)
    }
  })

  it('keeps side-handle resize on its axis despite cross-axis pointer motion', () => {
    const base = fixture(), drag = prepare(base, { x: 20, y: 30, width: 80, height: 50 }, 'e')
    const result = preview(base, drag, 80, 900)
    for (const change of result.changes) {
      expect(change.next.transform.scaleX).toBeCloseTo(2)
      expect(change.next.transform.scaleY).toBe(1)
      expect(change.next.transform.y).toBe(change.prev.transform.y)
    }
  })

  it.each(['shiftKey', 'ctrlKey', 'metaKey'])('makes a common side-handle resize uniform with %s', modifier => {
    const base = fixture(), drag = prepare(base, { x: 20, y: 30, width: 80, height: 50 }, 'e')
    const result = preview(base, drag, 40, 500, { [modifier]: true })
    for (const change of result.changes) {
      expect(change.next.transform.scaleX).toBeCloseTo(1.5)
      expect(change.next.transform.scaleY).toBeCloseTo(1.5)
    }
  })

  it('refuses a shearing world resize atomically without changing source layers or keys', () => {
    const base = fixture()
    base.layers[2] = { ...base.layers[2], transform: { ...base.layers[2].transform, rotationDeg: 45 } }
    const saved = structuredClone(base), drag = prepare(base, { x: 20, y: 30, width: 100, height: 80 }, 'e')
    expect(() => preview(base, drag, 100, 0)).toThrow(/shear/i)
    expect(base).toEqual(saved)
  })

  it('keeps existing key endpoints and anchors, and commits every resized root in one reversible transaction', () => {
    const base: ChronoScene = fixture()
    const key = { id: 'manual-middle', timeMs: 500, value: 20, easing: { type: 'easeInOut' as const }, tangentMode: 'aligned' as const }
    const keys = [{ ...key, id: 'start', timeMs: 0, value: 10 }, key, { ...key, id: 'end', timeMs: 1000, value: 30 }]
    base.timelines = [{ id: 'main', durationMs: 1000, loop: false, autoplay: false,
      tracks: [{ target: 'layers.group.transform.x', keyframes: keys }] }]
    const drag = prepare(base, { x: 20, y: 30, width: 80, height: 50 }, 'se', 500)
    const result = preview(base, drag, 80, 50)
    let command: EditorCommand | undefined
    const commit = vi.fn((value: EditorCommand) => { command = value })
    commitCanvasDrag({ commitTransaction: commit } as unknown as EditorStateReturn, base, drag, result, {
      buildLayerCommitCommands: changes => buildViewportKeyframeCommands(base, changes,
        { timelineId: 'main', timeMs: 500, autoKeyframe: true }), onSelectLayer: vi.fn() })
    expect(commit).toHaveBeenCalledTimes(1)
    const committed = command!.execute(base), keyframes = committed.timelines[0].tracks[0].keyframes
    expect(keyframes[0]).toBe(keys[0]); expect(keyframes[2]).toBe(keys[2])
    expect(keyframes[1]).toEqual({ ...key, value: result.scene.layers[0].transform.x })
    expect(committed.layers[0].transform.anchorX).toBe(base.layers[0].transform.anchorX)
    expect(committed.layers[2].transform.anchorY).toBe(base.layers[2].transform.anchorY)
    const undone = command!.undo(committed)
    expect(undone).toEqual(base)
    expect(command!.execute(undone)).toEqual(committed)
  })

  it('preserves the existing single-root axis-scale branch when no selection frame is supplied', () => {
    const base = { ...emptyScene(), layers: [layer('single', 40, 50)] }
    const drag = prepare(base, { x: 40, y: 50, width: 20, height: 10 }, 'e')
    delete drag.selectionResize
    drag.axis = 'x'
    const result = preview(base, drag, 50, 900)
    expect(result.scene.layers[0].transform.scaleX).toBe(1.5)
    expect(result.scene.layers[0].transform.scaleY).toBe(1)
    expect(result.scene.layers[0].transform.x).toBe(40)
    expect(result.scene.layers[0].transform.y).toBe(50)
  })
})
