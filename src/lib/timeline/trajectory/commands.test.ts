import { describe, expect, it, vi } from 'vitest'
import { emptyScene, newRectLayer } from '../../defaults'
import type { ChronoScene, Keyframe, Layer, Track } from '../../types'
import { evaluateNumericTrack } from '../../evaluator'
import { initHistory, pushHistory, redoHistory, undoHistory } from '../../editor/history'
import { prepareTrajectoryContext } from './capabilities'
import { projectTrajectoryPosition } from './frame'
import { setTrajectoryPoint, moveTrajectoryNodes, deleteTrajectoryNodes, retimeTrajectoryNodes, duplicateTrajectoryNodes,
  createTrajectoryKeyIdAllocator } from './commands'

const scope = { timelineId: 'motion', layerId: 'object' }
function key(id: string, timeMs: number, value: number): Keyframe {
  return { id, timeMs, value, easing: { type: 'linear' }, tangentMode: 'aligned' }
}
function fixture(): ChronoScene {
  const layer: Layer = { ...newRectLayer(), id: 'object', transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 3, anchorY: 4 } }
  return { ...emptyScene(), layers: [layer, { ...newRectLayer(), id: 'unrelated' }], timelines: [{
    id: 'motion', durationMs: 1000, autoplay: false, loop: false, layerIds: ['unrelated'],
    tracks: [{ target: 'layers.object.transform.x', label: 'Authored X', keyframes: [key('x0', 0, 10),
      Object.assign(key('xm', 500, 30), { manualNote: 'Preserve unknown source metadata' }), key('x1', 1000, 50)] },
      { target: 'layers.object.transform.y', label: 'Authored Y', keyframes: [{ ...key('y0', 0, 20), easing: { type: 'easeInOut' } }, key('y1', 1000, 80)] },
      { target: 'layers.object.opacity', keyframes: [key('opacity', 100, 0.6)] }],
  }] }
}
function position(scene: ChronoScene, timeMs: number) {
  const prepared = prepareTrajectoryContext(scene, scope.timelineId, scope.layerId)
  if (!prepared.ok) throw new Error('Fixture context missing')
  return projectTrajectoryPosition(prepared.context, timeMs)!
}

describe('trajectory spatial source commands', () => {
  it('preserves an existing key ID/easing/tangent and fills a sparse axis by splitting its underlying curve', () => {
    const scene = fixture(), before = structuredClone(scene), originalX = scene.timelines[0].tracks[0].keyframes[1]
    const originalY = scene.timelines[0].tracks[1]
    const result = moveTrajectoryNodes(scene, { ...scope, nodes: [{ timeMs: 500, xKeyId: 'xm' }], deltaWorld: { x: 20, y: 0 } })
    const next = result.command!.execute(scene)
    const updatedX = next.timelines[0].tracks[0].keyframes.find(value => value.id === 'xm')!
    expect(updatedX).toEqual({ ...originalX, value: 50 })
    const y = next.timelines[0].tracks[1], paired = y.keyframes.find(value => value.timeMs === 500)!
    expect(paired.value).toBe(50)
    expect(result.selectedIds).toEqual(['xm', paired.id])
    for (let ms = 0; ms <= 1000; ms += 13) expect(evaluateNumericTrack(y, ms)).toBeCloseTo(evaluateNumericTrack(originalY, ms)!, 7)
    expect(next.layers).toBe(scene.layers)
    expect(next.timelines[0].tracks[2]).toBe(scene.timelines[0].tracks[2])
    expect(next.timelines[0].layerIds).toEqual(['unrelated', 'object'])
    expect(scene).toEqual(before)
    expect(result.command!.undo(next)).toEqual(scene)
  })

  it('moves multiple nodes through each own parent-time inverse, including the exact loop endpoint', () => {
    const scene = fixture()
    const parent = { ...newRectLayer(), id: 'parent', type: 'group' as const,
      transform: { x: 100, y: 40, scaleX: 2, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 } }
    scene.layers = [parent, { ...scene.layers[0], parentId: 'parent' }, scene.layers[1]]
    scene.timelines[0] = { ...scene.timelines[0], loop: true,
      tracks: [...scene.timelines[0].tracks, { target: 'layers.parent.transform.rotationDeg', keyframes: [key('r0', 0, 0), key('r1', 1000, 90)] }] }
    const before = [position(scene, 0).world, position(scene, 1000).world]
    const result = moveTrajectoryNodes(scene, { ...scope, nodes: [{ timeMs: 0, xKeyId: 'x0', yKeyId: 'y0' },
      { timeMs: 1000, xKeyId: 'x1', yKeyId: 'y1' }], deltaWorld: { x: 10, y: 0 } })
    const next = result.command!.execute(scene)
    for (const [index, time] of Array.from([0, 1000].entries())) {
      const after = position(next, time).world
      expect(after.x).toBeCloseTo(before[index].x + 10)
      expect(after.y).toBeCloseTo(before[index].y)
    }
    expect(next.layers).toBe(scene.layers)
    expect(next.timelines[0].tracks[3]).toBe(scene.timelines[0].tracks[3])
  })

  it('keeps exact fractional times and rejects near-time sparse-axis collisions atomically', () => {
    const scene = fixture()
    scene.timelines[0].tracks[0] = { ...scene.timelines[0].tracks[0], keyframes: [key('xf', 373.25, 30)] }
    scene.timelines[0].tracks[1] = { ...scene.timelines[0].tracks[1], keyframes: [key('y0', 0, 20), key('y1', 1000, 80)] }
    const result = setTrajectoryPoint(scene, { ...scope, timeMs: 373.25, worldPoint: { x: 63, y: 44 } })
    const next = result.command!.execute(scene)
    expect(next.timelines[0].tracks[0].keyframes[0]).toMatchObject({ id: 'xf', timeMs: 373.25, value: 60 })
    expect(next.timelines[0].tracks[1].keyframes.some(value => value.timeMs === 373.25)).toBe(true)
    scene.timelines[0].tracks[1] = { ...scene.timelines[0].tracks[1], keyframes: [key('near', 373.75, 20)] }
    const saved = structuredClone(scene)
    expect(() => setTrajectoryPoint(scene, { ...scope, timeMs: 373.25, worldPoint: { x: 63, y: 44 } })).toThrow(/nearby/)
    expect(scene).toEqual(saved)
  })

  it('does not create a missing axis or an undo for a zero-delta node drag', () => {
    const scene = fixture(), result = moveTrajectoryNodes(scene, { ...scope, nodes: [{ timeMs: 500, xKeyId: 'xm' }], deltaWorld: { x: 0, y: 0 } })
    expect(result.command).toBeNull()
    expect(result.selectedIds).toEqual(['xm'])
    expect(scene.timelines[0].tracks[1].keyframes).toHaveLength(2)
  })

  it('does not scan unrelated source UUIDs for paired-key value drags, but checks them on sparse insertion', () => {
    const scene = fixture(), readId = vi.fn(() => 'opacity')
    Object.defineProperty(scene.timelines[0].tracks[2].keyframes[0], 'id', { get: readId })
    moveTrajectoryNodes(scene, { ...scope, nodes: [{ timeMs: 0, xKeyId: 'x0', yKeyId: 'y0' }], deltaWorld: { x: 10, y: 0 } })
    expect(readId).not.toHaveBeenCalled()
    moveTrajectoryNodes(scene, { ...scope, nodes: [{ timeMs: 500, xKeyId: 'xm' }], deltaWorld: { x: 10, y: 0 } })
    expect(readId).toHaveBeenCalledTimes(1)
  })

  it('never treats a nearby unselected sparse-axis key as the exact requested node', () => {
    const scene = fixture()
    scene.timelines[0].tracks[1] = { ...scene.timelines[0].tracks[1], keyframes: [key('near', 500.0000005, 20)] }
    const saved = structuredClone(scene)
    expect(() => moveTrajectoryNodes(scene, { ...scope, nodes: [{ timeMs: 500, xKeyId: 'xm' }], deltaWorld: { x: 10, y: 0 } })).toThrow(/nearby/)
    expect(scene).toEqual(saved)
  })

  it('keeps sparse-axis and easing support IDs stable across same-baseline gesture previews', () => {
    const scene = fixture()
    scene.timelines[0].tracks[0] = { ...scene.timelines[0].tracks[0],
      keyframes: scene.timelines[0].tracks[0].keyframes.map(value => value.id === 'xm' ? { ...value, timeMs: 373.25 } : value) }
    let sequence = 0
    const keyId = createTrajectoryKeyIdAllocator(() => `preview_${++sequence}`)
    const options = { ...scope, nodes: [{ timeMs: 373.25, xKeyId: 'xm' }], keyId }
    const first = moveTrajectoryNodes(scene, { ...options, deltaWorld: { x: 10, y: 5 } })
    const second = moveTrajectoryNodes(scene, { ...options, deltaWorld: { x: 20, y: 10 } })
    expect(first.selectedIds).toEqual(second.selectedIds)
    expect(first.supportIds).toEqual(second.supportIds)
    expect(first.supportIds).toHaveLength(1)
    expect(sequence).toBe(2)
    const a = first.command!.execute(scene), b = second.command!.execute(scene)
    expect(a.timelines[0].tracks[1].keyframes.map(value => value.id)).toEqual(b.timelines[0].tracks[1].keyframes.map(value => value.id))
    expect(first.command!.undo(a)).toEqual(scene)
    expect(second.command!.undo(b)).toEqual(scene)
    expect(scene.timelines[0].tracks[1].keyframes.map(value => value.id)).toEqual(['y0', 'y1'])
  })

  it('rejects a stale allocator UUID collision without replacing a manual key', () => {
    const scene = fixture(), saved = structuredClone(scene)
    expect(() => moveTrajectoryNodes(scene, { ...scope, nodes: [{ timeMs: 500, xKeyId: 'xm' }],
      deltaWorld: { x: 10, y: 0 }, keyId: () => 'xm' })).toThrow(/collides/)
    expect(scene).toEqual(saved)
  })

  it('rejects a singular parent at a later selected key time without applying earlier valid nodes', () => {
    const scene = fixture(), parent = { ...newRectLayer(), id: 'parent', type: 'group' as const }
    scene.layers = [parent, { ...scene.layers[0], parentId: 'parent' }, scene.layers[1]]
    scene.timelines[0].tracks.push({ target: 'layers.parent.transform.scaleX', keyframes: [key('s0', 0, 1), key('s1', 1000, 0)] })
    const saved = structuredClone(scene)
    expect(() => moveTrajectoryNodes(scene, { ...scope, nodes: [{ timeMs: 0, xKeyId: 'x0', yKeyId: 'y0' },
      { timeMs: 1000, xKeyId: 'x1', yKeyId: 'y1' }], deltaWorld: { x: 10, y: 0 } })).toThrow(/parent/)
    expect(scene).toEqual(saved)
  })

  it('refuses driven, inline and bound output without changing source', () => {
    const cases = [fixture(), fixture(), fixture()]
    cases[0].layers[0] = { ...cases[0].layers[0], motionPath: { pathData: 'M0 0 L100 0', autoRotate: false } }
    cases[1].layers[0] = { ...cases[1].layers[0], paramBindings: { 'transform.x': 'driver' } }
    cases[2].timelines[0].tracks[0] = { ...cases[2].timelines[0].tracks[0], modifiers: [{ id: 'offset', type: 'offset', enabled: true,
      blendMode: 'replace', weight: 1, parameters: { delta: 5 } }] }
    for (const scene of cases) {
      const saved = structuredClone(scene)
      expect(() => setTrajectoryPoint(scene, { ...scope, timeMs: 500, worldPoint: { x: 80, y: 90 } })).toThrow()
      expect(scene).toEqual(saved)
    }
  })
})

describe('trajectory key selection commands', () => {
  it('deletes only selected position IDs, retaining other keys, settings and opacity', () => {
    const scene = fixture(), result = deleteTrajectoryNodes(scene, { ...scope, nodes: [{ timeMs: 500, xKeyId: 'xm' }] })
    const next = result.command!.execute(scene)
    expect(next.timelines[0].tracks[0].keyframes.map(value => value.id)).toEqual(['x0', 'x1'])
    expect(next.timelines[0].tracks[0].label).toBe('Authored X')
    expect(next.timelines[0].tracks[1]).toBe(scene.timelines[0].tracks[1])
    expect(next.timelines[0].tracks[2]).toBe(scene.timelines[0].tracks[2])
    expect(result.command!.undo(next)).toEqual(scene)
  })

  it('retimes paired keys as one undo while preserving their values and exact IDs', () => {
    const scene = fixture(), result = retimeTrajectoryNodes(scene, { ...scope,
      nodes: [{ timeMs: 0, xKeyId: 'x0', yKeyId: 'y0' }], deltaTimeMs: 100 })
    const next = result.command!.execute(scene), history = pushHistory(initHistory(scene), next)
    expect(next.timelines[0].tracks[0].keyframes[0]).toEqual({ ...scene.timelines[0].tracks[0].keyframes[0], timeMs: 100 })
    expect(next.timelines[0].tracks[1].keyframes[0]).toEqual({ ...scene.timelines[0].tracks[1].keyframes[0], timeMs: 100 })
    expect(history.past).toHaveLength(1)
    expect(undoHistory(history).present).toBe(scene)
    expect(redoHistory(undoHistory(history)).present).toBe(next)
    expect(result.command!.undo(next)).toEqual(scene)
  })

  it.each([1000, -1, Number.NaN])('rejects an out-of-bounds/colliding retime delta %s without partial writes', deltaTimeMs => {
    const scene = fixture(), saved = structuredClone(scene)
    expect(() => retimeTrajectoryNodes(scene, { ...scope, nodes: [{ timeMs: 0, xKeyId: 'x0', yKeyId: 'y0' }], deltaTimeMs })).toThrow()
    expect(scene).toEqual(saved)
  })

  it('duplicates sparse selected keys with stable fresh IDs and leaves original records exact', () => {
    const scene = fixture(), result = duplicateTrajectoryNodes(scene, { ...scope, nodes: [{ timeMs: 500, xKeyId: 'xm' }], deltaTimeMs: 200 })
    const next = result.command!.execute(scene), duplicated = next.timelines[0].tracks[0].keyframes.find(value => value.timeMs === 700)!
    expect(duplicated).toEqual({ ...scene.timelines[0].tracks[0].keyframes[1], id: result.selectedIds[0], timeMs: 700 })
    expect(duplicated.id).not.toBe('xm')
    expect(next.timelines[0].tracks[0].keyframes[1]).toBe(scene.timelines[0].tracks[0].keyframes[1])
    expect(next.timelines[0].tracks[1]).toBe(scene.timelines[0].tracks[1])
    expect(result.command!.execute(result.command!.undo(next))).toEqual(next)
  })
})

describe('trajectory source dependency guard', () => {
  it.each(['parent', 'parent-keys', 'clock'] as const)('rejects stale %s source even if target position arrays did not change', kind => {
    const scene = fixture(), parent = { ...newRectLayer(), id: 'parent', type: 'group' as const }
    scene.layers = [parent, { ...scene.layers[0], parentId: 'parent' }, scene.layers[1]]
    scene.timelines[0].tracks.push({ target: 'layers.parent.transform.x', keyframes: [key('px', 0, 10)] })
    const result = setTrajectoryPoint(scene, { ...scope, timeMs: 500, worldPoint: { x: 100, y: 100 } })
    const changed = kind === 'parent' ? { ...scene, layers: [{ ...parent, transform: { ...parent.transform, x: 999 } }, ...scene.layers.slice(1)] }
      : { ...scene, timelines: [{ ...scene.timelines[0], ...(kind === 'clock' ? { durationMs: 2000 } : {
        tracks: scene.timelines[0].tracks.map(track => track.target === 'layers.parent.transform.x' ? { ...track, keyframes: [key('px', 0, 999)] } : track),
      }) }] }
    expect(() => result.command!.execute(changed)).toThrow(/source|clock/)
    expect(changed.timelines[0].tracks[0]).toBe(scene.timelines[0].tracks[0])
  })

  it('preserves an unrelated rename and unrelated track edit when applying a prepared command', () => {
    const scene = fixture(), result = setTrajectoryPoint(scene, { ...scope, timeMs: 500, worldPoint: { x: 90, y: 90 } })
    const opacity: Track = { ...scene.timelines[0].tracks[2], label: 'Manual opacity label' }
    const changed = { ...scene, layers: [scene.layers[0], { ...scene.layers[1], name: 'Manual rename' }],
      timelines: [{ ...scene.timelines[0], tracks: [scene.timelines[0].tracks[0], scene.timelines[0].tracks[1], opacity] }] }
    const next = result.command!.execute(changed)
    expect(next.layers).toBe(changed.layers)
    expect(next.layers[1].name).toBe('Manual rename')
    expect(next.timelines[0].tracks[2]).toBe(opacity)
  })
})
