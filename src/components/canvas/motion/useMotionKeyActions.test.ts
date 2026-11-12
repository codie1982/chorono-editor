import { describe, expect, it, vi } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '@/lib/defaults'
import { buildTrajectoryModel } from '@/lib/timeline/trajectory'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { ChronoScene } from '@/lib/types'
import { useMotionKeyActions } from './useMotionKeyActions'

vi.mock('react', () => ({ useCallback: (callback: unknown) => callback }))

/** Exercise UI command composition against actual trajectory builders. Only
 * React callback retention and editor storage are adapted; no geometry/key
 * algorithm is reimplemented in these action-level acceptance tests. */
function fixture() {
  const layer = { ...newRectLayer(), id: 'hero' }, timeline = newTimeline()
  layer.transform.anchorX = 0; layer.transform.anchorY = 0
  timeline.id = 'motion'; timeline.durationMs = 1000; timeline.loop = false
  timeline.tracks = [
    { target: 'layers.hero.transform.x', keyframes: [
      { id: 'x-start', timeMs: 0, value: 100, easing: { type: 'linear' } },
      { id: 'x-mid', timeMs: 500, value: 150, easing: { type: 'easeOut' }, tangentMode: 'broken' },
      { id: 'x-end', timeMs: 1000, value: 200, easing: { type: 'hold' } },
    ] },
    { target: 'layers.hero.transform.y', keyframes: [
      { id: 'y-mid', timeMs: 500, value: 200, easing: { type: 'easeInOut' } },
    ] },
  ]
  const base = { ...emptyScene(), layers: [layer], timelines: [timeline] }
  let scene: ChronoScene = base, active = false
  const commands: Parameters<EditorStateReturn['dispatchCommand']>[0][] = []
  const editor = { getScene: () => scene, isTransactionActive: () => active,
    dispatchCommand: (command: Parameters<EditorStateReturn['dispatchCommand']>[0]) => { commands.push(command); scene = command.execute(scene) },
  } as unknown as EditorStateReturn
  const selectedNodes = buildTrajectoryModel(base, 'motion', 'hero').nodes.filter(node => node.timeMs === 500)
  const onSelect = vi.fn(), onSeek = vi.fn(), onWarning = vi.fn()
  const actions = useMotionKeyActions({ editor, timelineId: 'motion', layerId: 'hero', selectedNodes, onSelect, onSeek, onWarning })
  return { base, actions, commands, onSelect, onSeek, onWarning, scene: () => scene, activate: () => { active = true } }
}

describe('motion key numeric and toolbar actions', () => {
  it('retimes and places a numeric node in one undo, preserving existing IDs/easing and other keys', () => {
    const h = fixture(), before = structuredClone(h.base)
    h.actions.numeric({ timeMs: 600, x: 180, y: 240 })
    expect(h.commands).toHaveLength(1)
    const tracks = h.scene().timelines[0].tracks
    expect(tracks[0].keyframes.find(key => key.id === 'x-mid')).toMatchObject({ timeMs: 600, value: 180, easing: { type: 'easeOut' }, tangentMode: 'broken' })
    expect(tracks[1].keyframes.find(key => key.id === 'y-mid')).toMatchObject({ timeMs: 600, value: 240, easing: { type: 'easeInOut' } })
    expect(tracks[0].keyframes.filter(key => key.id !== 'x-mid')).toEqual(before.timelines[0].tracks[0].keyframes.filter(key => key.id !== 'x-mid'))
    expect(h.commands[0].undo(h.scene())).toEqual(before)
    expect(h.onSelect).toHaveBeenLastCalledWith(new Set(['x-mid', 'y-mid']))
    expect(h.onSeek).toHaveBeenCalledWith(600)
  })

  it('reports a collision without dispatch, source mutation or a misleading seek', () => {
    const h = fixture()
    h.actions.numeric({ timeMs: 1000, x: 180, y: 240 })
    expect(h.commands).toEqual([]); expect(h.scene()).toBe(h.base)
    expect(h.onSeek).not.toHaveBeenCalled(); expect(h.onWarning).toHaveBeenCalled()
  })

  it('places at the exact retimed native timestamp after a fractional-ms numeric edit', () => {
    const h = fixture()
    h.actions.numeric({ timeMs: 33.3, x: 180, y: 240 })
    expect(h.commands).toHaveLength(1)
    const nodeKeys = h.scene().timelines[0].tracks.flatMap(track => track.keyframes).filter(key => key.id === 'x-mid' || key.id === 'y-mid')
    const actualTime = 500 + (33.3 - 500)
    expect(actualTime).not.toBe(33.3)
    expect(nodeKeys.map(key => key.timeMs)).toEqual([actualTime, actualTime])
    expect(nodeKeys.map(key => key.value)).toEqual([180, 240])
    expect(h.onSeek).toHaveBeenCalledWith(actualTime)
    expect(h.commands[0].undo(h.scene())).toEqual(h.base)
  })

  it('blocks toolbar source edits while a pointer transaction owns history', () => {
    const h = fixture(); h.activate(); h.actions.remove(); h.actions.duplicate(50)
    expect(h.commands).toEqual([]); expect(h.scene()).toBe(h.base)
    expect(h.onWarning).toHaveBeenCalledWith('Finish or cancel the active drag before editing keys.')
  })

  it('duplicates native keys with new identities through the same toolbar action', () => {
    const h = fixture(); h.actions.duplicate(100)
    expect(h.commands).toHaveLength(1)
    const duplicated = h.scene().timelines[0].tracks.flatMap(track => track.keyframes).filter(key => key.timeMs === 600)
    expect(duplicated).toHaveLength(2)
    expect(duplicated.map(key => key.id)).not.toContain('x-mid')
    expect(duplicated.map(key => key.id)).not.toContain('y-mid')
    expect(h.commands[0].undo(h.scene())).toEqual(h.base)
  })
})
