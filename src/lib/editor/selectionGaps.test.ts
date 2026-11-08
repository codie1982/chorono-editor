import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../defaults'
import type { ChronoScene, Layer } from '../types'
import { evaluateTimelines } from '../evaluator'
import { createLayerWorldBoundsResolver } from '../geometry/resolveLayerWorldBounds'
import { resolveLayerWorldMatrix } from '../geometry/resolveLayerWorldMatrix'
import { makeBatchCmd } from './commands-batch'
import { makeUpdateLayerCmd } from './commands-layer'
import { buildViewportKeyframeCommands, type ViewportLayerChange } from './viewportKeyframes'
import { prepareSelectionGaps, SELECTION_GAP_LIMITS } from './selectionGaps'

/** Authored pixel-aligned fixture; geometry deliberately excludes style effects. */
function rect(id: string, x: number, y: number, width = 100, height = 100): Layer {
  return { ...newRectLayer(), id, name: id, size: { width, height },
    transform: { x, y, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 } }
}

/** Same source/key command seam used by native viewport adapters, one batch. */
function commandFor(scene: ChronoScene, changes: readonly ViewportLayerChange[], timeMs = 0) {
  return makeBatchCmd('Edit neighbor gap', [
    ...changes.map(change => makeUpdateLayerCmd(change.prev.id, change.next, change.prev)),
    ...buildViewportKeyframeCommands(scene, changes, { timelineId: 'motion', timeMs, autoKeyframe: false }),
  ])
}

describe('editable selected neighbor measurements', () => {
  it('shows only the four-object example nearest cardinal pairs, retaining authored order', () => {
    const scene = { ...emptyScene(), layers: [rect('top', 0, 0), rect('middle', 0, 150), rect('bottom', 0, 300), rect('right', 250, 150)] }
    const plan = prepareSelectionGaps(scene, ['right', 'top', 'middle', 'bottom'], 0)
    expect(plan.rootIds).toEqual(['top', 'middle', 'bottom', 'right'])
    expect(plan.gaps.map(gap => [gap.axis, gap.beforeId, gap.afterId, gap.gap])).toEqual([
      ['x', 'middle', 'right', 150], ['y', 'top', 'middle', 50], ['y', 'middle', 'bottom', 50],
    ])
    expect(plan.gaps[0].from).toEqual({ x: 100, y: 200 })
    expect(plan.gaps[0].to).toEqual({ x: 250, y: 200 })
    expect(plan.truncated).toBe(false)
    expect(plan.diagnostics).toEqual([])
  })

  it('edits the active-anchored pair only and preserves neighboring selection members', () => {
    const scene = { ...emptyScene(), layers: [rect('left', 0, 0), rect('right', 200, 0), rect('far', 400, 0)] }
    const plan = prepareSelectionGaps(scene, ['left', 'right', 'far'], 0, undefined, 'right')
    const gap = plan.gaps.find(item => item.beforeId === 'left')!
    expect(gap.fixedId).toBe('right'); expect(gap.movingId).toBe('left')
    const changes = plan.edit(gap.id, 40), command = commandFor(scene, changes), after = command.execute(scene)
    expect(after.layers[0].transform.x).toBe(60)
    expect(after.layers[1]).toBe(scene.layers[1]); expect(after.layers[2]).toBe(scene.layers[2])
    expect(prepareSelectionGaps(after, ['left', 'right', 'far'], 0).gaps[0].gap).toBe(40)
    expect(command.undo(after)).toEqual(scene)
    expect(plan.edit(gap.id, gap.gap)).toEqual([])
    expect(() => plan.assertCurrent({ ...scene })).toThrow(/changed/)
    expect(() => plan.assertCurrent(scene)).not.toThrow()
  })

  it('moves group geometry once for parent+child selections and resolves active child to its root', () => {
    const group = { ...rect('group', 20, 10), type: 'group' as const }
    const child = { ...rect('child', 0, 0), parentId: group.id }, other = rect('other', 220, 10)
    const scene = { ...emptyScene(), layers: [group, child, other] }
    const plan = prepareSelectionGaps(scene, ['child', 'group', 'other'], 0, undefined, 'child')
    expect(plan.rootIds).toEqual(['group', 'other'])
    expect(plan.gaps[0].fixedId).toBe('group')
    const command = commandFor(scene, plan.edit(plan.gaps[0].id, 25)), after = command.execute(scene)
    expect(after.layers[0]).toBe(group); expect(after.layers[1]).toBe(child)
    expect(after.layers[2].transform.x).toBe(145)
    expect(prepareSelectionGaps(after, ['group', 'other'], 0).gaps[0].gap).toBe(25)
  })

  it('converts world gap delta through a rotated reflected nonuniform parent', () => {
    const parent = { ...rect('parent', 200, 100), type: 'group' as const,
      transform: { x: 200, y: 100, rotationDeg: 35, scaleX: -2, scaleY: 0.7, anchorX: 7, anchorY: 2 } }
    const child = { ...rect('child', 0, 0), parentId: parent.id }, fixed = rect('fixed', 450, 120, 100, 150)
    const scene = { ...emptyScene(), layers: [parent, child, fixed] }
    const plan = prepareSelectionGaps(scene, ['child', 'fixed'], 0, undefined, 'fixed')
    const gap = plan.gaps.find(item => item.axis === 'x')!
    expect(gap).toBeTruthy()
    const before = resolveLayerWorldMatrix(child, scene).applyToPoint({ x: 23, y: 17 })
    const after = commandFor(scene, plan.edit(gap.id, gap.gap + 25)).execute(scene)
    const point = resolveLayerWorldMatrix(after.layers[1], after).applyToPoint({ x: 23, y: 17 })
    expect(point.x - before.x).toBeCloseTo(-25)
    expect(point.y - before.y).toBeCloseTo(0)
    expect(after.layers[0]).toBe(parent)
    expect(after.layers[1].transform.rotationDeg).toBe(child.transform.rotationDeg)
    expect(after.layers[1].transform.scaleX).toBe(child.transform.scaleX)
  })

  it('measures evaluated keys and edits an existing key preserving all metadata and unrelated fallback channels', () => {
    const hero = rect('hero', 0, 0), fixed = rect('fixed', 300, 0), timeline = newTimeline()
    timeline.id = 'motion'; timeline.durationMs = 1000; timeline.loop = false
    timeline.tracks = [
      { target: 'layers.hero.transform.x', keyframes: [
        { id: 'start', timeMs: 0, value: 10, easing: { type: 'linear' } },
        { id: 'mid', timeMs: 500, value: 50, easing: { type: 'easeInOut' }, tangentMode: 'broken' },
        { id: 'end', timeMs: 1000, value: 100, easing: { type: 'hold' } },
      ] },
      { target: 'layers.hero.transform.scaleY', keyframes: [{ id: 'scale', timeMs: 500, value: 1.5, easing: { type: 'linear' } }] },
    ]
    const scene = { ...emptyScene(), layers: [hero, fixed], timelines: [timeline] }, snapshot = structuredClone(scene)
    const plan = prepareSelectionGaps(scene, ['hero', 'fixed'], 500, undefined, 'fixed'), gap = plan.gaps[0]
    expect(gap.gap).toBe(150)
    const changes = plan.edit(gap.id, 100)
    expect(changes[0].changedProperties).toEqual(['transform.x'])
    const command = commandFor(scene, changes, 500), after = command.execute(scene)
    expect(evaluateTimelines(after.timelines, 500).get('layers.hero.transform.x')).toBe(100)
    expect(after.layers[0].transform.scaleY).toBe(1)
    expect(after.timelines[0].tracks[0].keyframes).toEqual(timeline.tracks[0].keyframes.map(key => key.id === 'mid' ? { ...key, value: 100 } : key))
    expect(after.timelines[0].tracks[1]).toBe(timeline.tracks[1])
    expect(command.undo(after)).toEqual(snapshot); expect(scene).toEqual(snapshot)
  })

  it('handles overlap explicitly without diagonal/corner pairs or silent order reversal', () => {
    const scene = { ...emptyScene(), layers: [rect('left', 0, 0), rect('right', 80, 0), rect('diagonal', 180, 100)] }
    const plan = prepareSelectionGaps(scene, scene.layers.map(layer => layer.id), 0)
    expect(plan.gaps.filter(gap => gap.axis === 'x').map(gap => gap.gap)).toEqual([-20])
    expect(plan.gaps.some(gap => gap.beforeId === 'diagonal' || gap.afterId === 'diagonal')).toBe(false)
    const gap = plan.gaps[0], after = commandFor(scene, plan.edit(gap.id, -35)).execute(scene)
    expect(after.layers[1].transform.x).toBe(65)
    expect(() => plan.edit(gap.id, -101)).toThrow(/reverse/)
    expect(() => plan.edit(gap.id, NaN)).toThrow(/finite/)
    expect(() => plan.edit('missing', 10)).toThrow(/no longer/)
  })

  it('measures locked objects but rejects edits before mutating, and diagnoses unsupported geometry', () => {
    const left = rect('left', 0, 0), right = { ...rect('right', 200, 0), locked: true }
    const audio = { ...rect('audio', 300, 0), type: 'audio' as const }
    const scene = { ...emptyScene(), layers: [left, right, audio] }, snapshot = structuredClone(scene)
    const plan = prepareSelectionGaps(scene, ['left', 'right', 'audio'], 0)
    expect(plan.gaps).toHaveLength(1)
    expect(plan.diagnostics[0]).toMatch(/audio.*no measurable/)
    expect(() => plan.edit(plan.gaps[0].id, 20)).toThrow(/Unlock/)
    expect(scene).toEqual(snapshot)
  })

  it('uses an injected matching resolver, rejects nonfinite geometry and bounds work before large selection evaluation', () => {
    const scene = { ...emptyScene(), layers: [rect('left', 0, 0), rect('right', 100, 100)] }
    const plan = prepareSelectionGaps(scene, ['left', 'right'], 0, undefined, undefined, {
      boundsFor: layer => ({ x: layer.id === 'left' ? 0 : 250, y: 0, width: 100, height: 100 }),
    })
    expect(plan.gaps[0].gap).toBe(150)
    const bad = prepareSelectionGaps(scene, ['left', 'right'], 0, undefined, undefined, { boundsFor: () => ({ x: Infinity, y: 0, width: 100, height: 100 }) })
    expect(bad.gaps).toEqual([]); expect(bad.diagnostics).toHaveLength(2)
    const nonfinite = { ...scene, layers: [scene.layers[0], { ...scene.layers[1], transform: { ...scene.layers[1].transform, x: Infinity } }] }
    const invalidPose = prepareSelectionGaps(nonfinite, ['left', 'right'], 0)
    expect(invalidPose.gaps).toEqual([]); expect(invalidPose.diagnostics[0]).toMatch(/right.*finite/)
    let visited = 0
    const many = { ...scene, layers: Array.from({ length: SELECTION_GAP_LIMITS.roots + 1 }, (_, index) => rect(String(index), index * 150, 0)) }
    const bounded = prepareSelectionGaps(many, many.layers.map(layer => layer.id), 0, undefined, undefined,
      { boundsFor: () => { visited++; return null } })
    expect(bounded.gaps).toEqual([]); expect(bounded.truncated).toBe(true); expect(visited).toBe(0)
    const complete = { ...scene, layers: many.layers.slice(0, SELECTION_GAP_LIMITS.roots) }
    const truncated = prepareSelectionGaps(complete, complete.layers.map(layer => layer.id), 0)
    expect(truncated.gaps).toHaveLength(SELECTION_GAP_LIMITS.pairs)
    expect(truncated.truncated).toBe(true)
  })

  it('rejects malformed ancestry and invalid time without repair, and uses canonical curved geometry bounds', () => {
    const parent = { ...rect('parent', 0, 0), parentId: 'child' }, child = { ...rect('child', 0, 0), parentId: 'parent' }
    const malformed = { ...emptyScene(), layers: [parent, child] }
    expect(() => prepareSelectionGaps(malformed, ['child'], 0)).toThrow(/Cyclic/)
    expect(() => prepareSelectionGaps(malformed, ['missing'], 0)).toThrow(/no longer/)
    expect(() => prepareSelectionGaps(malformed, ['child'], -1)).toThrow(/time/)
    const ellipse = { ...rect('ellipse', 0, 0, 100, 40), shapeKind: 'ellipse' as const,
      transform: { ...rect('a', 0, 0).transform, rotationDeg: 45 } }, peer = rect('peer', 200, 0)
    const scene = { ...emptyScene(), layers: [ellipse, peer] }
    const bounds = createLayerWorldBoundsResolver(scene)(ellipse)!
    const plan = prepareSelectionGaps(scene, ['ellipse', 'peer'], 0)
    expect(plan.gaps[0].boundsBefore).toEqual(bounds)
    expect(plan.gaps[0].gap).toBeCloseTo(200 - bounds.x - bounds.width)
  })
})
