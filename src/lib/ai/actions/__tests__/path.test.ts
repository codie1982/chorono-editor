// ── Path & Motion AI action tests ─────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest'
import { ActionRegistry } from '../../ActionRegistry'
import { registerPathActions } from '../path'
import { emptyScene } from '@/lib/defaults'
import type { ChronoScene, Layer } from '@/lib/types'

function run(reg: ActionRegistry, scene: ChronoScene, tool: string, params: Record<string, unknown>): ChronoScene {
  const def = reg.get(tool)!
  const cmd = def.toCommand!(params, scene)!
  if (cmd.label.startsWith('AI ERROR')) throw new Error(cmd.label)
  return cmd.execute(scene)
}

function shape(id: string): Layer {
  return {
    id, name: id, type: 'shape',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
  } as Layer
}

describe('AI path & motion actions', () => {
  let reg: ActionRegistry
  beforeEach(() => {
    reg = new ActionRegistry()
    registerPathActions(reg)
  })

  it('add_path builds a path layer from points', () => {
    const next = run(reg, emptyScene(), 'add_path', {
      id: 'p1', points: [[0, 0], [100, 50], [200, 0]], role: 'motion',
    })
    const layer = next.layers[0]
    expect(layer.type).toBe('path')
    expect(layer.pathRole).toBe('motion')
    expect(layer.path?.anchors).toHaveLength(3)
    expect(layer.path?.anchors[1]).toMatchObject({ x: 100, y: 50 })
  })

  it('add_path rejects fewer than 2 points', () => {
    expect(() => run(reg, emptyScene(), 'add_path', { id: 'p', points: [[0, 0]] })).toThrow(/at least 2 points/)
  })

  it('assign_motion_path sets followPath', () => {
    let scene = emptyScene()
    scene.layers = [shape('ball')]
    scene = run(reg, scene, 'add_path', { id: 'track', points: [[0, 0], [300, 0]], role: 'motion' })
    scene = run(reg, scene, 'assign_motion_path', { layerId: 'ball', pathLayerId: 'track', orientToPath: true })
    const ball = scene.layers.find((l) => l.id === 'ball')!
    expect(ball.followPath).toMatchObject({ pathLayerId: 'track', orientToPath: true })
  })

  it('assign_motion_path animates progress 0→1 when animateMs given', () => {
    let scene = emptyScene()
    scene.layers = [shape('ball')]
    scene = run(reg, scene, 'add_path', { id: 'track', points: [[0, 0], [300, 0]] })
    scene = run(reg, scene, 'assign_motion_path', { layerId: 'ball', pathLayerId: 'track', animateMs: 1000, timelineId: 'main' })
    const tl = scene.timelines.find((t) => t.id === 'main')!
    const track = tl.tracks.find((t) => t.target === 'layers.ball.followPath.progress')!
    expect(track.keyframes.map((k) => k.value)).toEqual([0, 1])
    expect(tl.layerIds).toContain('ball')
  })

  it('trim_path sets stroke trim', () => {
    let scene = emptyScene()
    scene.layers = [{ ...shape('line'), style: { stroke: { color: '#fff', width: 2 } } } as Layer]
    scene = run(reg, scene, 'trim_path', { layerId: 'line', start: 0, end: 0.5 })
    const layer = scene.layers[0]
    expect(layer.style?.stroke?.trim).toMatchObject({ start: 0, end: 0.5, offset: 0 })
  })

  it('assign_motion_path rejects a non-path target', () => {
    let scene = emptyScene()
    scene.layers = [shape('ball'), shape('notpath')]
    expect(() =>
      run(reg, scene, 'assign_motion_path', { layerId: 'ball', pathLayerId: 'notpath' }),
    ).toThrow(/not a path layer/)
  })
})
