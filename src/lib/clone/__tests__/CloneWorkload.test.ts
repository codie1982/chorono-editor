import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../../defaults'
import { assertCloneBudget } from '../../mcp/protocol'
import { assertCloneForestBudget } from '../CloneWorkload'

/** Minimal source forest with two independently timed channels. */
function fixture() {
  const root = newRectLayer(), child = { ...newRectLayer(), parentId: root.id }
  const first = newTimeline(), other = newTimeline()
  first.tracks = [{ target: `layers.${child.id}.transform.x`, keyframes: Array.from({ length: 25000 }, (_, i) =>
    ({ id: `a${i}`, timeMs: i, value: i, easing: { type: 'linear' as const } })) }]
  other.tracks = [{ target: `layers.${root.id}.opacity`, keyframes: [{ id: 'b', timeMs: 0, value: 1, easing: { type: 'linear' } }] }]
  return { scene: { ...emptyScene(), layers: [root, child], timelines: [first, other] }, root, child, first, other }
}

describe('shared clone workload admission', () => {
  it('counts descendant keys on every timeline through the legacy MCP adapter', () => {
    const { scene, root } = fixture()
    expect(() => assertCloneBudget(scene, root.id, 1)).toThrow('workload limit')
  })

  it('counts existing keys even when the command copies a narrower timeline scope', () => {
    const { scene, root, child, other } = fixture(), ids = new Set([root.id, child.id])
    expect(() => assertCloneForestBudget(scene, ids, 1, { timelineIds: new Set([other.id]) })).not.toThrow()
    scene.timelines[0].tracks[0].keyframes.push(...scene.timelines[0].tracks[0].keyframes)
    expect(() => assertCloneForestBudget(scene, ids, 1, { timelineIds: new Set([other.id]) })).toThrow('workload limit')
  })

  it('admits exact layer capacity but includes placement wrappers before allocation', () => {
    const scene = emptyScene(), root = newRectLayer(); scene.layers = [root]
    expect(() => assertCloneForestBudget(scene, new Set([root.id]), 4999)).not.toThrow()
    expect(() => assertCloneForestBudget(scene, new Set([root.id]), 4999, { extraLayersPerOccurrence: 1 })).toThrow('workload limit')
    expect(() => assertCloneForestBudget(scene, new Set(['missing']), 1)).toThrow('source')
    expect(() => assertCloneForestBudget(scene, new Set([root.id]), 1.5)).toThrow('count')
  })
})
