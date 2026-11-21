import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { rigidBakeFixture } from '@/lib/bake/__tests__/RigidBodyBakeFixture'
import { EditorDocumentLifetime } from '@/lib/editor/lifecycle/EditorDocumentLifetime'
import { MCPPhysicsBakeJobManager } from '@/lib/mcp/bake/MCPPhysicsBakeJobManager'
import { prepareMCPRigidBake } from '@/lib/mcp/bake/MCPRigidBake'
import type { PhysicsBakeController } from '@/components/physics/usePhysicsBakeController'
import JobsBakePanel from './JobsBakePanel'

const controller: PhysicsBakeController = {
  snapshot: null,
  descriptor: null,
  start() {},
  startRebake() {},
  cancel() {},
  discard() {},
  checkSource: () => true,
  inspectBake() { throw new Error('No bake fixture') },
  clearBake() {},
  commit: async () => {},
}

/** Wait for the deterministic inline test solver without hiding terminal errors. */
async function waitForPreview(manager: MCPPhysicsBakeJobManager, jobId: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const snapshot = manager.status(jobId)
    if (snapshot.status === 'preview-ready') return snapshot
    if (snapshot.status === 'failed' || snapshot.status === 'stale' || snapshot.status === 'cancelled') {
      throw new Error(snapshot.error ?? snapshot.progress.message)
    }
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  throw new Error('Bake preview did not become ready')
}

describe('JobsBakePanel', () => {
  it('presents retained MCP work with one aggregate live status and review actions', async () => {
    const scene = rigidBakeFixture().scene
    const document = new EditorDocumentLifetime()
    const manager = new MCPPhysicsBakeJobManager({ idFactory: () => 'bake-uiqueue01' })
    const started = manager.startRigid({
      getScene: () => scene,
      getRevision: () => 0,
      getDocumentSignal: () => document.signal,
      isTransactionActive: () => false,
      subscribeCommitted: () => () => {},
    }, {
      timelineId: 'main', durationMs: 200, stepHz: 60, sampleFps: 30,
      bodies: [
        { layerId: 'box', motionType: 'dynamic' },
        { layerId: 'floor', motionType: 'static' },
      ],
    })
    await waitForPreview(manager, started.jobId)

    const html = renderToStaticMarkup(createElement(JobsBakePanel, {
      controller,
      editor: { dispatchCommand() {} } satisfies Pick<EditorStateReturn, 'dispatchCommand'>,
      jobManager: manager,
    }))
    expect(html).toContain('MCP jobs')
    expect(html).toContain('1 ready to review')
    expect(html).toContain('Review preview')
    expect(html).toContain('Apply bake')
    expect(html).toContain('Discard')
    expect(html).toContain('Keys retained / candidate')
    expect(html).toContain('Protected events')
    expect(html).toContain('Maximum error')
    expect(html.match(/role="status"/g)).toHaveLength(1)
    expect(html).toContain('min-h-11')
    manager.dispose()
  })

  it('requires an explicit destructive label for an MCP replacement of edited output', async () => {
    const initial = rigidBakeFixture().scene
    const baked = await prepareMCPRigidBake(initial, {
      timelineId: 'main', durationMs: 200, stepHz: 60, sampleFps: 30,
      bodies: [{ layerId: 'box', motionType: 'dynamic' }],
      recordId: 'jobs-edited-v1',
    })
    const edited = {
      ...baked.scene,
      timelines: baked.scene.timelines.map(timeline => timeline.id === 'main' ? {
        ...timeline,
        tracks: timeline.tracks.map((track, index) => index === 0 ? {
          ...track,
          keyframes: track.keyframes.map((key, keyIndex) => keyIndex === 0
            ? { ...key, value: Number(key.value) + 1 }
            : key),
        } : track),
      } : timeline),
    }
    const document = new EditorDocumentLifetime()
    const manager = new MCPPhysicsBakeJobManager({ idFactory: () => 'bake-uireplace1' })
    const started = manager.startRigid({
      getScene: () => edited,
      getRevision: () => 1,
      getDocumentSignal: () => document.signal,
      isTransactionActive: () => false,
      subscribeCommitted: () => () => {},
    }, {
      timelineId: 'main', durationMs: 200, stepHz: 60, sampleFps: 30,
      bodies: [{ layerId: 'box', motionType: 'dynamic' }],
      replaceRecordId: 'jobs-edited-v1',
    })
    await waitForPreview(manager, started.jobId)
    const html = renderToStaticMarkup(createElement(JobsBakePanel, {
      controller,
      editor: { dispatchCommand() {} } satisfies Pick<EditorStateReturn, 'dispatchCommand'>,
      jobManager: manager,
    }))
    expect(html).toContain('Edited or legacy output detected')
    expect(html).toContain('Replace edited bake')
    expect(html).toContain('bg-red-700')
    manager.dispose()
  })
})
