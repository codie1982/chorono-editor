import { describe, expect, it } from 'vitest'
import { rigidBakeFixture } from '@/lib/bake/__tests__/RigidBodyBakeFixture'
import { EditorDocumentLifetime } from '@/lib/editor/lifecycle/EditorDocumentLifetime'
import type { ChronoScene } from '@/lib/types'
import { MCPPhysicsBakeJobManager } from './MCPPhysicsBakeJobManager'

function hostFixture() {
  let scene: ChronoScene = rigidBakeFixture().scene
  let revision = 0
  let transactionActive = false
  const committedListeners = new Set<(scene: ChronoScene) => void>()
  const document = new EditorDocumentLifetime()
  const publishCommitted = () => committedListeners.forEach(listener => listener(scene))
  return {
    host: {
      getScene: () => scene,
      getRevision: () => revision,
      getDocumentSignal: () => document.signal,
      isTransactionActive: () => transactionActive,
      subscribeCommitted: (listener: (value: ChronoScene) => void) => {
        committedListeners.add(listener)
        return () => { committedListeners.delete(listener) }
      },
    },
    scene: () => scene,
    publish: (command: { execute(scene: ChronoScene): ChronoScene }) => {
      scene = command.execute(scene); revision++; publishCommitted()
    },
    changeSource: () => {
      scene = { ...scene, layers: scene.layers.map(layer => layer.id === 'box'
        ? { ...layer, transform: { ...layer.transform, x: layer.transform.x + 10 } }
        : layer) }
      revision++
      publishCommitted()
    },
    setTransaction: (active: boolean) => { transactionActive = active },
    replaceDocument: () => document.replace(),
  }
}

const rigidInput = {
  timelineId: 'main', durationMs: 200, stepHz: 60, sampleFps: 30,
  bodies: [
    { layerId: 'box', motionType: 'dynamic' as const },
    { layerId: 'floor', motionType: 'static' as const },
  ],
}

async function waitFor(manager: MCPPhysicsBakeJobManager, jobId: string, status: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const snapshot = manager.status(jobId)
    if (snapshot.status === status) return snapshot
    if (snapshot.status === 'failed' || snapshot.status === 'stale' || snapshot.status === 'cancelled') {
      throw new Error(`Bake stopped in ${snapshot.status}: ${snapshot.error ?? snapshot.progress.message}`)
    }
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  throw new Error(`Bake did not reach ${status}`)
}

describe('persistent MCP physics bake jobs', () => {
  it('prepares, samples, commits and retains a small completed report', async () => {
    const fixture = hostFixture()
    const manager = new MCPPhysicsBakeJobManager({ idFactory: () => 'bake-testjob01' })
    const started = manager.startRigid(fixture.host, rigidInput)
    expect(started.jobId).toBe('bake-testjob01')
    expect(['queued', 'running']).toContain(started.status)

    const ready = await waitFor(manager, started.jobId, 'preview-ready')
    expect(ready.report).toMatchObject({ sampleCount: 7, bodyCount: 2 })
    const preview = manager.preview(started.jobId, 100)
    expect(preview).toMatchObject({ timeMs: 100, absoluteTimeMs: 100, durationMs: 200 })
    expect(preview.bodies.map(body => body.layerId)).toEqual(['box', 'floor'])

    const completed = await manager.commit(started.jobId, fixture.publish)
    expect(completed.status).toBe('completed')
    expect(completed.report?.sampleCount).toBe(7)
    expect(fixture.scene().timelines[0].tracks).toHaveLength(3)
    expect(fixture.scene().physics?.rigidBakes).toHaveLength(1)
    expect(manager.inspect(started.jobId)).toBeUndefined()
    manager.discard(started.jobId)
    expect(manager.getSnapshots()).toHaveLength(0)
    manager.dispose()
  })

  it('marks a ready preview stale after a relevant source change', async () => {
    const fixture = hostFixture()
    const manager = new MCPPhysicsBakeJobManager({ idFactory: () => 'bake-testjob02' })
    const { jobId } = manager.startRigid(fixture.host, rigidInput)
    await waitFor(manager, jobId, 'preview-ready')
    fixture.changeSource()
    expect(manager.getSnapshots()[0]).toMatchObject({ status: 'stale', error: expect.stringContaining('source changed') })
    expect(() => manager.preview(jobId, 0)).toThrow(/not ready/)
    manager.dispose()
  })

  it('supports immediate cooperative cancellation and document replacement', async () => {
    const fixture = hostFixture()
    const ids = ['bake-testjob03', 'bake-testjob04']
    const manager = new MCPPhysicsBakeJobManager({ idFactory: () => ids.shift()! })
    const long = manager.startRigid(fixture.host, { ...rigidInput, durationMs: 1_000, stepHz: 240, sampleFps: 60 })
    expect(manager.cancel(long.jobId).status).toBe('cancelled')

    const next = manager.startRigid(fixture.host, rigidInput)
    fixture.replaceDocument()
    expect(manager.status(next.jobId).status).toBe('stale')
    manager.dispose()
  })

  it('refuses start and commit while an editor transaction is active', async () => {
    const fixture = hostFixture()
    const manager = new MCPPhysicsBakeJobManager({ idFactory: () => 'bake-testjob05' })
    fixture.setTransaction(true)
    expect(() => manager.startRigid(fixture.host, rigidInput)).toThrow(/transaction/)
    fixture.setTransaction(false)
    const { jobId } = manager.startRigid(fixture.host, rigidInput)
    await waitFor(manager, jobId, 'preview-ready')
    fixture.setTransaction(true)
    await expect(manager.commit(jobId, fixture.publish)).rejects.toThrow(/transaction/)
    manager.dispose()
  })
})
