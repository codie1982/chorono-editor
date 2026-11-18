import { describe, expect, it } from 'vitest'
import { ResourceBudget } from '@/lib/resources/budget'
import { BakeService } from '../BakeService'
import { RigidBodyBakeAdapter } from '../adapters/RigidBodyBakeAdapter'
import { rigidBakeFixture } from './RigidBodyBakeFixture'

describe('RigidBodyBakeAdapter', () => {
  it('simulates a falling rectangle and returns budgeted normal tracks', async () => {
    const { recipe } = rigidBakeFixture(), budget = new ResourceBudget({ maxBytes: 8 * 1024 ** 2 })
    const adapter = new RigidBodyBakeAdapter({ allocator: budget, yieldEveryTicks: 32 })
    const service = new BakeService()
    const job = service.createJob({
      kind: adapter.kind, label: 'Rigid fixture', source: recipe.source,
      isSourceCurrent: () => true, prepare: context => adapter.prepare(recipe, context),
      discardPreview: preview => preview.release(),
    })
    await job.start()
    const preview = job.getSnapshot().preview!
    expect(job.getSnapshot().status).toBe('preview-ready')
    expect(preview.report).toMatchObject({ tickCount: 360, sampleCount: 91, bodyCount: 2,
      dynamicBodyCount: 1, keyframeCount: 273, solver: 'matter-js@0.20.0' })
    expect(preview.tracks.map(track => track.target)).toEqual([
      'layers.box.transform.x', 'layers.box.transform.y', 'layers.box.transform.rotationDeg',
    ])
    expect(preview.clip.poseAt('rigid:box', 90).centerY).toBeCloseTo(350, 0)
    expect(preview.tracks[1].keyframes.at(-1)?.value).toBeCloseTo(300, 0)
    expect(budget.getSnapshot().chargedBytes).toBe(preview.report.retainedBytes)
    job.dispose()
    expect(budget.getSnapshot().chargedBytes).toBe(0)
    expect(() => preview.clip).toThrow(/released/)
    service.dispose()
  })

  it('observes cancellation before allocating or initializing a solver', async () => {
    const { recipe } = rigidBakeFixture(), budget = new ResourceBudget({ maxBytes: 8 * 1024 ** 2 })
    const controller = new AbortController(); controller.abort()
    await expect(new RigidBodyBakeAdapter({ allocator: budget }).prepare(recipe, {
      signal: controller.signal, reportProgress: () => {},
    })).rejects.toThrow(/cancel/i)
    expect(budget.getSnapshot().chargedBytes).toBe(0)
  })
})
