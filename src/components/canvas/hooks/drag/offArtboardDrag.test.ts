import { describe, expect, it, vi } from 'vitest'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import type { ChronoScene, Layer } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { prepareTransformTargets } from '@/lib/canvas/math/preparedTransforms'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { buildViewportKeyframeCommands } from '@/lib/editor/viewportKeyframes'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { previewTransformDrag } from './transformDragPreview'
import { commitCanvasDrag } from './commitCanvasDrag'
import type { MoveState } from '../../types/canvasDragTypes'

const pointer = { pointerId: 1, clientX: 0, clientY: 0, shiftKey: false, metaKey: false, ctrlKey: false }

/** Prepare the production move adapter with real evaluated targets and bounds. */
function moved(base: ChronoScene, id: string, delta: { x: number; y: number }, timeMs = 0) {
  const target = base.layers.find(layer => layer.id === id)!
  const prepared = prepareTransformTargets(base, [id], timeMs)
  if (!prepared.ok) throw new Error(prepared.reason)
  const drag: MoveState = { kind: 'move', layerId: id, originalLayer: target, targets: prepared.targets,
    movingLayers: [], startClientX: 0, startClientY: 0, width: 40, height: 30 }
  return { drag, preview: previewTransformDrag({ base, drag, event: pointer, delta, pointerWorld: delta,
    dimensions: { width: 100, height: 80 }, bounds: { moving: { x: 10, y: 20, width: 40, height: 30 }, others: [] }, engine: null }) }
}

describe('off-artboard translation retains native source/key ownership', () => {
  it('can move through every composition edge and continue farther outside on the next gesture', () => {
    const layer = newRectLayer(); layer.transform = { ...layer.transform, x: 10, y: 20 }
    const base = { ...emptyScene(), layers: [layer] }
    for (const delta of [{ x: -70, y: -60 }, { x: 200, y: 200 }]) {
      const first = moved(base, layer.id, delta).preview
      expect(first.scene.layers[0].transform.x).toBe(10 + delta.x)
      expect(first.scene.layers[0].transform.y).toBe(20 + delta.y)
      const next = moved(first.scene, layer.id, { x: -5, y: -9 }).preview
      expect(next.scene.layers[0].transform.x).toBe(5 + delta.x)
      expect(next.scene.layers[0].transform.y).toBe(11 + delta.y)
    }
    expect(base.layers[0]).toBe(layer)
  })

  it('commits one out-of-bounds move under a rotated reflected parent while retaining endpoint keys and exact undo', () => {
    const parent: Layer = { ...newRectLayer(), id: 'parent', type: 'group', size: undefined,
      transform: { x: 250, y: 100, scaleX: -2, scaleY: 3, rotationDeg: 30, anchorX: 0, anchorY: 0 } }
    const child: Layer = { ...newRectLayer(), id: 'child', parentId: parent.id,
      transform: { x: 0, y: 20, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 } }
    const keys = [{ id: 'start', timeMs: 0, value: 0, easing: { type: 'linear' as const } },
      { id: 'end', timeMs: 1000, value: 100, easing: { type: 'easeOut' as const }, tangentMode: 'broken' as const }]
    const base: ChronoScene = { ...emptyScene(), layers: [parent, child], timelines: [{ id: 'main', durationMs: 1000,
      autoplay: false, loop: false, tracks: [{ target: 'layers.child.transform.x', keyframes: keys }] }] }
    const before = resolveLayerWorldMatrix(child, base, 500).applyToPoint({ x: 0, y: 0 })
    const { drag, preview } = moved(base, child.id, { x: -500, y: -400 }, 500)
    let committed = base, command: EditorCommand | undefined
    const editor = { commitTransaction: (value: EditorCommand) => { command = value; committed = value.execute(base) } } as unknown as EditorStateReturn
    commitCanvasDrag(editor, base, drag, preview, { onSelectLayer: vi.fn(),
      buildLayerCommitCommands: changes => buildViewportKeyframeCommands(base, changes, { timelineId: 'main', timeMs: 500, autoKeyframe: true }) })
    const after = resolveLayerWorldMatrix(committed.layers[1], committed, 500).applyToPoint({ x: 0, y: 0 })
    expect(after.x - before.x).toBeCloseTo(-500); expect(after.y - before.y).toBeCloseTo(-400)
    expect(committed.layers[0]).toBe(parent)
    const nextKeys = committed.timelines[0].tracks[0].keyframes
    expect(nextKeys.filter(key => key.timeMs !== 500)).toEqual(keys)
    expect(nextKeys[0]).toBe(keys[0]); expect(nextKeys[2]).toBe(keys[1])
    expect(command!.undo(committed)).toEqual(base)
    expect(command!.execute(command!.undo(committed))).toEqual(committed)
  })
})
