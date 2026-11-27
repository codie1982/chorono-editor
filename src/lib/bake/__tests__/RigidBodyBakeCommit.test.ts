import { describe, expect, it, vi } from 'vitest'
import { makeApplyRigidBodyBakeCmd } from '@/lib/editor/commands-rigid-body-bake'
import { evaluateNumericTrack } from '@/lib/evaluator'
import { exportToRuntime } from '@/lib/export/runtimeExport'
import { defaultRuntimeExporter } from '@/lib/export/RuntimeExporter'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'
import { ChronoPlayer } from '@/lib/player/ChronoPlayer'
import { ResourceBudget } from '@/lib/resources/budget'
import { RigidBodyBakeAdapter } from '../adapters/RigidBodyBakeAdapter'
import { rigidBakeFixture } from './RigidBodyBakeFixture'

describe('Rigid body bake commit', () => {
  it('publishes portable normal tracks, plays without a solver and undoes exactly', async () => {
    const { scene, recipe } = rigidBakeFixture()
    const adapter = new RigidBodyBakeAdapter({ allocator: new ResourceBudget({ maxBytes: 8 * 1024 ** 2 }) })
    const preview = await adapter.prepare(recipe, { signal: new AbortController().signal, reportProgress: () => {} })
    const command = makeApplyRigidBodyBakeCmd({ recipe, tracks: preview.tracks,
      sampleCount: preview.report.sampleCount, recordId: 'falling-box-v1' })
    const next = command.execute(scene)
    expect(next.layers).toBe(scene.layers)
    expect(next.timelines[0].tracks).toHaveLength(3)
    expect(next.physics?.rigidBakes[0]).toMatchObject({ id: 'falling-box-v1', sampleCount: 91 })
    const y = next.timelines[0].tracks.find(track => track.target === 'layers.box.transform.y')!
    expect(evaluateNumericTrack(y, 0)).toBe(50)
    expect(evaluateNumericTrack(y, 3000)).toBeCloseTo(300, 0)

    const runtime = exportToRuntime(next)
    expect(runtime).not.toHaveProperty('physics')
    expect(runtime.timelines[0].tracks).toHaveLength(3)
    const packaged = defaultRuntimeExporter.export(next).runtime
    expect(packaged).not.toHaveProperty('physics')
    expect(packaged.assets).toEqual(next.assets)
    for (const timeMs of [0, 500, 1500, 3000]) {
      const authoredFrame = new ChronoPlayer(next, null, { loop: false }).tick(timeMs)
      const runtimeFrame = new ChronoPlayer(runtime, null, { loop: false }).tick(timeMs)
      const packagedFrame = new ChronoPlayer(packaged, null, { loop: false }).tick(timeMs)
      expect(runtimeFrame.overrides).toEqual(authoredFrame.overrides)
      expect(packagedFrame.overrides).toEqual(authoredFrame.overrides)
    }
    expect(parseSceneJson(JSON.stringify(next), true)).toEqual(next)
    expect(command.undo(next)).toStrictEqual(scene)
    preview.release()
  })

  it('rejects a stale source or altered generated track set before mutation', async () => {
    const { scene, recipe } = rigidBakeFixture()
    const preview = await new RigidBodyBakeAdapter({ allocator: new ResourceBudget({ maxBytes: 8 * 1024 ** 2 }) })
      .prepare(recipe, { signal: new AbortController().signal, reportProgress: () => {} })
    const stale = { ...scene, layers: scene.layers.map(layer => layer.id === 'box'
      ? { ...layer, transform: { ...layer.transform, x: layer.transform.x + 1 } } : layer) }
    const command = makeApplyRigidBodyBakeCmd({ recipe, tracks: preview.tracks, sampleCount: preview.report.sampleCount })
    expect(() => command.execute(stale)).toThrow(/source changed/)
    const wrong = makeApplyRigidBodyBakeCmd({ recipe, tracks: preview.tracks.slice(0, 2), sampleCount: preview.report.sampleCount })
    expect(() => wrong.execute(scene)).toThrow(/do not match/)
    const solver = vi.spyOn(adapterPrototype(), 'prepare')
    evaluateNumericTrack(preview.tracks[0], 1500)
    expect(solver).not.toHaveBeenCalled()
    solver.mockRestore(); preview.release()
  })
})

function adapterPrototype(): RigidBodyBakeAdapter {
  return RigidBodyBakeAdapter.prototype as RigidBodyBakeAdapter
}
