import { describe, expect, it, vi } from 'vitest'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import type { ChronoScene, Layer } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { prepareTransformTargets, rotateTransformTargets } from '@/lib/canvas/math/preparedTransforms'
import { buildViewportKeyframeCommands } from '@/lib/editor/viewportKeyframes'
import { previewTransformDrag, transformPreview } from './transformDragPreview'
import { previewGeometryDrag } from './geometryDragPreview'
import { commitCanvasDrag } from './commitCanvasDrag'

const pointer = { pointerId: 1, clientX: 10, clientY: 0, shiftKey: false, metaKey: false, ctrlKey: false }
const transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 }
function layer(id: string, patch: Partial<Layer> = {}): Layer { return { ...newRectLayer(), id, transform: { ...transform }, ...patch } }
function scene(layers: Layer[]): ChronoScene { return { ...emptyScene(), layers } }
function targets(source: ChronoScene, ids: string[]) {
  const prepared = prepareTransformTargets(source, ids, 0)
  if (!prepared.ok) throw new Error(prepared.reason)
  return prepared.targets
}

describe('evaluated canvas previews and atomic commits', () => {
  it('moves a parented child by the world delta once, without moving its descendants locally', () => {
    const parent = layer('parent', { type: 'group', transform: { ...transform, rotationDeg: 90, scaleX: 2, scaleY: 3 } })
    const child = layer('child', { type: 'group', parentId: parent.id })
    const leaf = layer('leaf', { parentId: child.id, transform: { ...transform, x: 5, y: 6 } })
    const base = scene([parent, child, leaf]), prepared = targets(base, [child.id, leaf.id])
    const before = resolveLayerWorldMatrix(leaf, base).applyToPoint({ x: 0, y: 0 })
    const preview = previewTransformDrag({ base, drag: { kind: 'move', layerId: child.id, originalLayer: child,
      startClientX: 0, startClientY: 0, movingLayers: [], width: 10, height: 10, targets: prepared },
      event: pointer, delta: { x: 30, y: 20 }, pointerWorld: { x: 30, y: 20 },
      dimensions: { width: 500, height: 500 }, bounds: { moving: null, others: [] }, engine: null })
    const after = resolveLayerWorldMatrix(preview.scene.layers[2], preview.scene).applyToPoint({ x: 0, y: 0 })
    expect(after.x - before.x).toBeCloseTo(30)
    expect(after.y - before.y).toBeCloseTo(20)
    expect(preview.scene.layers[2]).toBe(leaf)
    expect(preview.changes.map(change => change.next.id)).toEqual(['child'])
  })

  it('does not stamp an unedited animated x output when only rotation changes', () => {
    const original = layer('animated')
    const base = { ...scene([original]), timelines: [{ id: 'main', durationMs: 1000, loop: false, autoplay: false,
      tracks: [{ target: 'layers.animated.transform.x', keyframes: [{ id: 'x', timeMs: 0, value: 50, easing: { type: 'linear' as const } }] }] }] }
    const prepared = targets(base, [original.id])
    const preview = transformPreview(base, prepared, new Map([[original.id, { ...prepared[0].transform, rotationDeg: 30 }]]))
    expect(preview.scene.layers[0].transform.x).toBe(0)
    expect(preview.overrides.has('layers.animated.transform.x')).toBe(false)
    expect(preview.changes[0].changedProperties).toEqual(['transform.rotationDeg'])
    expect(base.timelines[0].tracks[0].keyframes[0].value).toBe(50)
  })

  it('keys every changed root in one transaction and preserves existing key identity/easing', () => {
    const a = layer('a'), b = layer('b', { transform: { ...transform, x: 100 } })
    const key = { id: 'manual-key', timeMs: 0, value: 40, easing: { type: 'easeInOut' as const }, tangentMode: 'aligned' as const }
    const base = { ...scene([a, b]), timelines: [{ id: 'main', durationMs: 1000, loop: false, autoplay: false,
      tracks: [{ target: 'layers.a.transform.x', keyframes: [key] }] }] }
    const prepared = targets(base, ['a', 'b'])
    const preview = transformPreview(base, prepared, new Map(prepared.map(target => [target.id, { ...target.transform, x: target.transform.x + 10 }])))
    let committed = base, commits = 0
    const legacy = vi.fn()
    const editor = { commitTransaction: (command: { execute: (value: ChronoScene) => ChronoScene }) => { commits++; committed = command.execute(base) as typeof base } } as unknown as EditorStateReturn
    commitCanvasDrag(editor, base, { kind: 'move', layerId: 'a', originalLayer: a, startClientX: 0, startClientY: 0,
      width: 10, height: 10, movingLayers: [], targets: prepared }, preview, {
      buildLayerCommitCommands: changes => buildViewportKeyframeCommands(base, changes, { timelineId: 'main', timeMs: 0, autoKeyframe: true }),
      onAfterLayerCommit: legacy, onSelectLayer: vi.fn() })
    expect(commits).toBe(1)
    expect(legacy).not.toHaveBeenCalled()
    const first = committed.timelines[0].tracks.find(track => track.target === 'layers.a.transform.x')!.keyframes[0]
    expect(first).toEqual({ ...key, value: 50 })
    expect(committed.timelines[0].tracks.find(track => track.target === 'layers.b.transform.x')!.keyframes[0].value).toBe(110)
    expect(base.timelines[0].tracks[0].keyframes[0]).toBe(key)
  })

  it('retains key intent when a displayed value is dragged back to its identical authored fallback', () => {
    const original = layer('a'), base = { ...scene([original]), timelines: [{ id: 'main', durationMs: 1000, loop: false, autoplay: false,
      tracks: [{ target: 'layers.a.transform.x', keyframes: [{ id: 'x', timeMs: 0, value: 50, easing: { type: 'linear' as const } }] }] }] }
    const prepared = targets(base, ['a'])
    const preview = transformPreview(base, prepared, new Map([['a', { ...prepared[0].transform, x: 0 }]]))
    expect(preview.changes[0].next.transform.x).toBe(original.transform.x)
    expect(preview.changes[0].changedProperties).toEqual(['transform.x'])
    const commands = buildViewportKeyframeCommands(base, preview.changes, { timelineId: 'main', timeMs: 0, autoKeyframe: false })
    expect(commands[0].execute(base).timelines[0].tracks[0].keyframes[0].value).toBe(0)
  })

  it('reports an unrepresentable multi-world rotation instead of partially changing the selection', () => {
    const parent = layer('parent', { type: 'group', transform: { ...transform, scaleX: 2, scaleY: 1 } })
    const base = scene([parent, layer('a', { parentId: 'parent' }), layer('b', { transform: { ...transform, x: 100 } })])
    const result = rotateTransformTargets(targets(base, ['a', 'b']), { x: 50, y: 0 }, 45)
    expect(result.ok).toBe(false)
    expect(base.layers[1].transform).toEqual(transform)
  })

  it('keeps drag-copy subtree sources immutable and commits one cloned forest', () => {
    const group = layer('group', { type: 'group' }), child = layer('child', { parentId: 'group', transform: { ...transform, x: 7, y: 8 } })
    const base = scene([group, child]), prepared = targets(base, ['group', 'child'])
    const preview = transformPreview(base, prepared, new Map([['group', { ...prepared[0].transform, x: 40 }]]))
    let committed: ChronoScene = base
    const selected = vi.fn()
    const editor = { commitTransaction: (command: { execute: (value: ChronoScene) => ChronoScene }) => { committed = command.execute(base) } } as unknown as EditorStateReturn
    commitCanvasDrag(editor, base, { kind: 'move', layerId: 'group', originalLayer: group,
      startClientX: 0, startClientY: 0, width: 10, height: 10, movingLayers: [], targets: prepared, cloneMode: 'copy' },
    preview, { onSelectLayer: selected })
    expect(committed.layers).toHaveLength(4)
    expect(committed.layers[0]).toBe(group)
    expect(committed.layers[1]).toBe(child)
    const copy = committed.layers[2], copiedChild = committed.layers[3]
    expect(copy.transform.x).toBe(40)
    expect(copiedChild.parentId).toBe(copy.id)
    expect(copiedChild.transform).toEqual(child.transform)
    expect(committed.timelines).toEqual(base.timelines)
    expect(selected).toHaveBeenCalledWith(copy.id)
  })
})

describe('geometry-local pointer edits', () => {
  it('commits a provisional pen anchor without recentering the existing custom pivot', () => {
    const original = layer('path', { type: 'path', transform: { ...transform, rotationDeg: 60, scaleX: 2, anchorX: 8, anchorY: 9 },
      path: { closed: false, anchors: [{ x: 5, y: 6 }] } })
    const provisional = { ...original, path: { ...original.path!, anchors: [...original.path!.anchors, { x: 30, y: 40 }] } }
    const base = scene([provisional]), world = resolveLayerWorldMatrix(original, base)
    const preview = previewGeometryDrag({ base, drag: { kind: 'newAnchorDraw', layerId: original.id, originalLayer: original,
      startClientX: 0, startClientY: 0, anchorIndex: 1, anchorX: 30, anchorY: 40, worldToLocal: world.invert() },
      event: { ...pointer, clientX: 0 }, delta: { x: 0, y: 0 }, snap: { grid: false, pixel: false, size: 10 } })
    expect(preview.scene.layers[0].transform).toBe(original.transform)
    expect(preview.scene.layers[0].path!.anchors).toHaveLength(2)
    expect(preview.changes[0].changedProperties).toEqual(['path'])
    expect(resolveLayerWorldMatrix(preview.scene.layers[0], preview.scene).applyToPoint({ x: 5, y: 6 })).toEqual(world.applyToPoint({ x: 5, y: 6 }))
  })

  it('maps a legacy Bezier handle through the complete inverse and preserves its custom pivot', () => {
    const original = layer('path', { type: 'path', transform: { ...transform, anchorX: 8, anchorY: 9 },
      path: { closed: false, anchors: [{ x: 0, y: 0, outX: 5, outY: 0 }] } })
    const base = scene([original])
    const preview = previewGeometryDrag({ base, drag: { kind: 'pathPoint', layerId: original.id, originalLayer: original,
      startClientX: 0, startClientY: 0, anchorIndex: 0, part: 'outHandle', worldToLocal: Matrix2D.rotation(90).scale(2, 2).invert() },
      event: pointer, delta: { x: 0, y: 10 }, snap: { grid: false, pixel: false, size: 10 } })
    expect(preview.scene.layers[0].path!.anchors[0].outX).toBeCloseTo(10)
    expect(preview.scene.layers[0].path!.anchors[0].outY).toBeCloseTo(0)
    expect(preview.scene.layers[0].transform).toBe(original.transform)
  })

  it('resizes rotated geometry while pinning the opposite corner and preserving negative scale', () => {
    const original = layer('box', { size: { width: 100, height: 60 }, transform: { ...transform, x: 120, y: 70,
      rotationDeg: 35, scaleX: -2, scaleY: 1.5, anchorX: 50, anchorY: 30 } })
    const base = scene([original]), world = resolveLayerWorldMatrix(original, base)
    const delta = world.applyToVector({ x: 20, y: 10 })
    const preview = previewGeometryDrag({ base, drag: { kind: 'resize', layerId: original.id, originalLayer: original,
      startClientX: 0, startClientY: 0, handle: 'nw', worldToLocal: world.invert(), displayTransform: original.transform },
      event: pointer, delta, snap: { grid: false, pixel: false, size: 10 } })
    const next = preview.scene.layers[0], matrix = resolveLayerWorldMatrix(next, preview.scene)
    const beforeCorner = world.applyToPoint({ x: 100, y: 60 }), afterCorner = matrix.applyToPoint({ x: next.size!.width, y: next.size!.height })
    expect(afterCorner.x).toBeCloseTo(beforeCorner.x)
    expect(afterCorner.y).toBeCloseTo(beforeCorner.y)
    expect(next.size).toEqual({ width: 80, height: 50 })
    expect(next.transform.scaleX).toBe(-2)
    expect(next.transform.anchorX).toBe(original.transform.anchorX)
    expect(next.transform.anchorY).toBe(original.transform.anchorY)
  })

  it('keeps the source pivot and other translation key endpoints when resizing an animated pose', () => {
    const original = layer('animated-size', { size: { width: 100, height: 60 }, transform: { ...transform,
      x: 120, y: 70, rotationDeg: 35, scaleX: -2, scaleY: 1.5, anchorX: 17, anchorY: -8 } })
    const xKeys = [{ id: 'x-start', timeMs: 0, value: 120, easing: { type: 'linear' as const } },
      { id: 'x-end', timeMs: 1000, value: 220, easing: { type: 'linear' as const } }]
    const yKeys = [{ id: 'y-start', timeMs: 0, value: 70, easing: { type: 'linear' as const } },
      { id: 'y-end', timeMs: 1000, value: 90, easing: { type: 'linear' as const } }]
    const base = { ...scene([original]), timelines: [{ id: 'main', durationMs: 1000, loop: false, autoplay: false,
      tracks: [{ target: `layers.${original.id}.transform.x`, keyframes: xKeys },
        { target: `layers.${original.id}.transform.y`, keyframes: yKeys }] }] }
    const prepared = prepareTransformTargets(base, [original.id], 500)
    if (!prepared.ok) throw new Error(prepared.reason)
    const target = prepared.targets[0], beforeWorld = target.worldMatrix
    const delta = beforeWorld.applyToVector({ x: 20, y: 10 })
    const preview = previewGeometryDrag({ base, drag: { kind: 'resize', layerId: original.id, originalLayer: original,
      startClientX: 0, startClientY: 0, handle: 'nw', worldToLocal: beforeWorld.invert(), displayTransform: target.transform },
      event: pointer, delta, snap: { grid: false, pixel: false, size: 10 } })
    let committed: ChronoScene = base
    commitCanvasDrag({ commitTransaction: (command: { execute: (value: ChronoScene) => ChronoScene }) => {
      committed = command.execute(base)
    } } as unknown as EditorStateReturn, base, { kind: 'resize', layerId: original.id, originalLayer: original,
      startClientX: 0, startClientY: 0, handle: 'nw' }, preview, {
      buildLayerCommitCommands: changes => buildViewportKeyframeCommands(base, changes,
        { timelineId: 'main', timeMs: 500, autoKeyframe: true }), onSelectLayer: vi.fn() })
    expect(committed.layers[0].transform.anchorX).toBe(17)
    expect(committed.layers[0].transform.anchorY).toBe(-8)
    for (const [index, endpoints] of Array.from([xKeys, yKeys].entries())) {
      const keys = committed.timelines[0].tracks[index].keyframes
      expect(keys.filter(key => key.timeMs !== 500)).toEqual(endpoints)
      expect(keys[0]).toBe(endpoints[0])
      expect(keys[2]).toBe(endpoints[1])
    }
    expect(preview.changes[0].changedProperties).not.toContain('transform.anchorX')
    expect(preview.changes[0].changedProperties).not.toContain('transform.anchorY')
    const next = committed.layers[0], afterWorld = resolveLayerWorldMatrix(next, committed, 500)
    const beforeCorner = beforeWorld.applyToPoint({ x: 100, y: 60 })
    const afterCorner = afterWorld.applyToPoint({ x: next.size!.width, y: next.size!.height })
    expect(afterCorner.x).toBeCloseTo(beforeCorner.x)
    expect(afterCorner.y).toBeCloseTo(beforeCorner.y)
    expect(base.layers[0]).toBe(original)
    expect(base.timelines[0].tracks[0].keyframes).toBe(xKeys)
  })
})
