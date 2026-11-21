import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newSplineLayerFromData, newStarLayer } from '@/lib/defaults'
import { StructuredGridMesh2DGenerator } from '@/lib/geometry/mesh2d'
import { FractureRenderColliderAnalyzer } from '@/lib/fracture/FractureRenderColliderAnalyzer'
import { PhysicsBakeRecipeFactory } from '@/lib/physics/PhysicsBakeRecipeFactory'
import { createRectangleSpline } from '@/lib/spline/primitives/createRectangleSpline'
import type { ChronoScene, Layer } from '@/lib/types'
import { prepareMCPRigidBake, prepareMCPVoronoiBake } from '../bake/MCPRigidBake'
import { validateToolCall } from '../catalog'
import { isSourceMutation } from '../source/ToolSourcePolicy'
import { fakeEditor } from './support/fakeEditor'

const access = { expectedRevision: 0, readToken: 'a'.repeat(64) }

/** Small deterministic scene that keeps integration tests fast. */
function fixture(): ChronoScene {
  const box: Layer = {
    ...newRectLayer(), id: 'box', size: { width: 80, height: 80 },
    transform: { x: 200, y: 40, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 40, anchorY: 40 },
    style: { fill: { type: 'solid', color: '#3B82F6' }, cornerRadius: 0 }, opacity: 1,
  }
  const floor: Layer = {
    ...newRectLayer(), id: 'floor', size: { width: 500, height: 30 },
    transform: { x: 0, y: 300, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 250, anchorY: 15 },
    style: { fill: { type: 'solid', color: '#475569' }, cornerRadius: 0 }, opacity: 1,
  }
  const base = emptyScene()
  return {
    ...base,
    composition: { ...base.composition, width: 500, height: 360, durationMs: 1000, frameRate: 30 },
    layers: [box, floor],
    timelines: [{ id: 'main', durationMs: 1000, autoplay: false, loop: false, tracks: [], layerIds: [] }],
  }
}

describe('MCP rigid/fracture bake workflows', () => {
  it('requires source authorization and validates bounded native inputs', async () => {
    expect(isSourceMutation('bake_rigid_bodies')).toBe(true)
    expect(isSourceMutation('bake_voronoi_fracture')).toBe(true)
    expect(isSourceMutation('prepare_rigid_body_bake')).toBe(true)
    expect(isSourceMutation('prepare_voronoi_fracture_bake')).toBe(true)
    expect(isSourceMutation('commit_bake_job')).toBe(true)
    expect(isSourceMutation('clear_physics_bake')).toBe(true)
    expect(isSourceMutation('inspect_physics_bake')).toBe(false)
    expect(isSourceMutation('get_bake_job')).toBe(false)
    expect(isSourceMutation('preview_bake_job')).toBe(false)
    expect(isSourceMutation('cancel_bake_job')).toBe(false)
    expect(isSourceMutation('discard_bake_job')).toBe(false)
    await expect(validateToolCall('bake_rigid_bodies', {
      ...access,
      timelineId: 'main', durationMs: 200,
      bodies: [{ layerId: 'box', motionType: 'dynamic' }],
    })).resolves.toHaveProperty('name', 'bake_rigid_bodies')
    await expect(validateToolCall('bake_voronoi_fracture', {
      ...access,
      sourceLayerId: 'box', timelineId: 'main', durationMs: 400,
      fractureTimeMs: 200, fragmentCount: 4, seed: 7, generationId: 'box-v1',
    })).resolves.toHaveProperty('name', 'bake_voronoi_fracture')
    await expect(validateToolCall('bake_voronoi_fracture', {
      ...access,
      sourceLayerId: 'box', timelineId: 'main', durationMs: 400,
      fractureTimeMs: 200, fragmentCount: 4, seed: 7, generationId: 'cluster-v1',
      cluster: {
        defaults: { impulseStrength: 10, damageThreshold: 20, relativeNormalSpeedScale: .1 },
        overrides: [{ fragmentAId: 'cluster-v1-fragment-0', fragmentBId: 'cluster-v1-fragment-1', unbreakable: true }],
        forcedBreaks: [{ bondId: 'cluster-v1-cluster-bond-0000000000000000', timeMs: 200, source: 'user' }],
        damageResets: [{ timeMs: 100, source: 'timeline' }],
      },
    })).resolves.toHaveProperty('name', 'bake_voronoi_fracture')
    await expect(validateToolCall('prepare_voronoi_fracture_bake', {
      ...access,
      sourceLayerId: 'box', staticLayerIds: ['floor'], timelineId: 'main', durationMs: 1000,
      fractureTrigger: { kind: 'impact', minimumRelativeNormalSpeedPxPerSecond: 50, colliderLayerIds: ['floor'] },
      explosion: {
        centerLocalOffsetPx: { x: 0, y: 0 }, radialVelocityPxPerSecond: 100,
        directionDeg: 270, directionalVelocityPxPerSecond: 0, spinVelocityDegPerSecond: 90,
        variation: .1, seed: 9,
      },
      fragmentCount: 4, seed: 7, generationId: 'impact-v1',
    })).resolves.toHaveProperty('name', 'prepare_voronoi_fracture_bake')
    await expect(validateToolCall('bake_voronoi_fracture', {
      ...access,
      sourceLayerId: 'box', timelineId: 'main', durationMs: 400,
      fractureTimeMs: 200, fragmentCount: 4, seed: 7, generationId: 'box:v1',
    })).rejects.toThrow()
    await expect(validateToolCall('prepare_rigid_body_bake', {
      ...access,
      timelineId: 'main', durationMs: 200,
      bodies: [{ layerId: 'box', motionType: 'dynamic' }],
    })).resolves.toHaveProperty('name', 'prepare_rigid_body_bake')
    await expect(validateToolCall('get_bake_job', { jobId: 'bake-testjob01' }))
      .resolves.toHaveProperty('name', 'get_bake_job')
    await expect(validateToolCall('inspect_physics_bake', { recordId: 'rigid-v1' }))
      .resolves.toHaveProperty('name', 'inspect_physics_bake')
    await expect(validateToolCall('clear_physics_bake', { ...access, recordId: 'rigid-v1', discardEdited: true }))
      .resolves.toHaveProperty('name', 'clear_physics_bake')
    await expect(validateToolCall('bake_voronoi_fracture', {
      ...access,
      sourceLayerId: 'box', timelineId: 'main', durationMs: 400,
      fractureTimeMs: 200, fragmentCount: 4, seed: 7, generationId: 'a'.repeat(117),
    })).rejects.toThrow()
  })

  it('publishes editable rigid transform tracks and provenance', async () => {
    const baked = await prepareMCPRigidBake(fixture(), {
      timelineId: 'main', durationMs: 200, stepHz: 60, sampleFps: 30,
      bodies: [
        { layerId: 'box', motionType: 'dynamic' },
        { layerId: 'floor', motionType: 'static' },
      ],
    })
    expect(baked.report.sampleCount).toBe(7)
    expect(baked.scene.timelines[0].tracks.map(track => track.target)).toEqual(expect.arrayContaining([
      'layers.box.transform.x', 'layers.box.transform.y', 'layers.box.transform.rotationDeg',
    ]))
    expect(baked.scene.physics?.rigidBakes).toHaveLength(1)
  })

  it('publishes Voronoi fragment layers, tracks and generation metadata atomically', async () => {
    const baked = await prepareMCPVoronoiBake(fixture(), {
      sourceLayerId: 'box', staticLayerIds: ['floor'], timelineId: 'main',
      durationMs: 400, fractureTimeMs: 200, fragmentCount: 4, seed: 7,
      generationId: 'box-v1', stepHz: 60, sampleFps: 30, gravity: { x: 0, y: 0 },
    })
    expect(baked.fragmentCount).toBe(4)
    expect(baked.scene.layers.filter(layer => layer.id.startsWith('box-v1-fragment-'))).toHaveLength(4)
    expect(baked.scene.layers.every(layer => /^[\w-]{1,128}$/.test(layer.id))).toBe(true)
    expect(baked.scene.physics?.fractureGenerations?.[0].generationId).toBe('box-v1')
    expect(baked.scene.physics?.rigidBakes).toHaveLength(1)
  })

  it('publishes and inspects bonded cluster breaks through the MCP service', async () => {
    const editor = fakeEditor('Bonded cluster owner')
    const scene = fixture()
    editor.replaceDocument(scene)
    try {
      const common = {
        sourceLayerId: 'box', staticLayerIds: ['floor'], timelineId: 'main',
        durationMs: 1000, fractureTimeMs: 100, fragmentCount: 6, seed: 42,
        generationId: 'mcp-cluster-v1', stepHz: 120, sampleFps: 30,
      } as const
      const graph = new PhysicsBakeRecipeFactory().compileVoronoi(scene, {
        ...common,
        cluster: { defaults: { impulseStrength: 1e6, damageThreshold: 1e6,
          relativeNormalSpeedScale: 0, variation: 0 } },
      }).recipe.fractureClusters![0].graph
      const forcedBondId = graph.bonds[0].bondId
      const baked = await editor.call('bake_voronoi_fracture', {
        ...common,
        cluster: { defaults: {
          impulseStrength: 1e6, damageThreshold: 1e6,
          relativeNormalSpeedScale: 0, variation: 0,
        },
        forcedBreaks: [{ bondId: forcedBondId, timeMs: 200, source: 'user' }],
        damageResets: [{ bondId: forcedBondId, timeMs: 150, source: 'user' }],
        },
      })
      expect(baked.bake.report).toMatchObject({
        clusterCount: 1,
        bondCount: expect.any(Number),
        bondBreakCount: expect.any(Number),
        clusterSplitCount: expect.any(Number),
      })
      expect(baked.bake.report.bondCount).toBeGreaterThan(0)
      expect(baked.bake.report.bondBreakCount).toBeGreaterThan(0)
      const record = editor.host.editor.getScene().physics!.rigidBakes[0]
      const inspection = (await editor.call('inspect_physics_bake', { recordId: record.id })).bake
      expect(inspection.bondedCluster).toMatchObject({
        graphId: 'mcp-cluster-v1-cluster',
        strategy: 'compoundBody',
        fragmentCount: 6,
        bondCount: expect.any(Number),
        breakCount: expect.any(Number),
        forcedBreakCount: 1,
        damageResetCount: 1,
        breakEvents: expect.any(Array),
      })
      const forced = inspection.bondedCluster.breakEvents.find((event: { bondId: string }) => event.bondId === forcedBondId)
      expect(forced).toMatchObject({ bondId: forcedBondId, reason: 'forced' })
      expect(forced.timeMs).toBeCloseTo(200, 7)
    } finally {
      await editor.close()
    }
  })

  it('publishes a convex spline source through the public MCP bake service', async () => {
    const scene = fixture()
    const spline = {
      ...newSplineLayerFromData(createRectangleSpline({ width: 100, height: 70 }), {
        name: 'Convex spline source', x: 200, y: 80,
      }),
      id: 'convex-spline-source',
    }
    const baked = await prepareMCPVoronoiBake({ ...scene, layers: [spline, scene.layers[1]] }, {
      sourceLayerId: spline.id, staticLayerIds: ['floor'], timelineId: 'main',
      durationMs: 400, fractureTimeMs: 200, fragmentCount: 4, seed: 17,
      generationId: 'spline-v1', stepHz: 60, sampleFps: 30, gravity: { x: 0, y: 0 },
    })

    const record = baked.scene.physics?.rigidBakes[0]
    expect(record?.recipe.bodies[0]).toMatchObject({
      layerId: spline.id,
      collider: 'convexPolygon',
      visual: { centerOfMassLocalPx: { x: 0, y: 0 } },
    })
    expect(baked.scene.layers.filter(layer => layer.id.startsWith('spline-v1-fragment-'))).toHaveLength(4)
    expect(record?.recipe.fractureAppearance).toMatchObject({ kind: 'solid', sourceLayerId: spline.id })
  })

  it('publishes a concave source through region Mesh2D and compound MCP bake contracts', async () => {
    const scene = fixture()
    const source = {
      ...newStarLayer(),
      id: 'concave-star-source',
      name: 'Concave star source',
      transform: { ...scene.layers[0].transform },
    }
    const baked = await prepareMCPVoronoiBake({ ...scene, layers: [source, scene.layers[1]] }, {
      sourceLayerId: source.id, staticLayerIds: ['floor'], timelineId: 'main',
      durationMs: 400, fractureTimeMs: 200, fragmentCount: 6, seed: 23,
      generationId: 'concave-star-v2', stepHz: 60, sampleFps: 30, gravity: { x: 0, y: 0 },
    })

    const generation = baked.scene.physics?.fractureGenerations?.[0]
    const record = baked.scene.physics?.rigidBakes[0]
    const fragments = baked.scene.layers.filter(layer => layer.id.startsWith('concave-star-v2-fragment-'))
    expect(generation?.schemaVersion).toBe(2)
    if (!generation || generation.schemaVersion !== 2) throw new Error('Expected FRACTURE1 region generation')
    expect(record?.recipe.bodies[0].collider).toBe('compoundPolygon')
    expect(record?.recipe.bodies.filter(body => body.activation)
      .every(body => body.collider === 'compoundPolygon' && body.colliderPartsPx?.length)).toBe(true)
    expect(fragments).toHaveLength(generation.fragments.length)
    expect(fragments.every(layer => layer.type === 'mesh2d'
      && layer.mesh2d?.source.kind === 'fractureFragment')).toBe(true)
    const quality = new FractureRenderColliderAnalyzer().analyzeCommittedEvent(
      baked.scene,
      record!.id,
    )
    expect(quality).toMatchObject({ status: 'pass' })
  })

  it('publishes a convex Mesh2D source with clipped fragment UV topology', async () => {
    const scene = fixture()
    const source = {
      ...scene.layers[0],
      id: 'convex-mesh-source',
      type: 'mesh2d' as const,
      mesh2d: new StructuredGridMesh2DGenerator().generate({
        width: 80,
        height: 80,
        columns: 2,
        rows: 2,
        diagonal: 'topLeftToBottomRight',
      }),
    }
    const baked = await prepareMCPVoronoiBake({ ...scene, layers: [source, scene.layers[1]] }, {
      sourceLayerId: source.id, staticLayerIds: ['floor'], timelineId: 'main',
      durationMs: 400, fractureTimeMs: 200, fragmentCount: 4, seed: 19,
      generationId: 'mesh-v1', stepHz: 60, sampleFps: 30, gravity: { x: 0, y: 0 },
    })

    const record = baked.scene.physics?.rigidBakes[0]
    const fragments = baked.scene.layers.filter(layer => layer.id.startsWith('mesh-v1-fragment-'))
    expect(record?.recipe.fractureAppearance).toMatchObject({ kind: 'mesh2d', sourceLayerId: source.id })
    expect(fragments).toHaveLength(4)
    expect(fragments.every(layer => layer.type === 'mesh2d'
      && !!layer.mesh2d
      && layer.mesh2d.geometry.uvs.length === layer.mesh2d.geometry.positions.length)).toBe(true)
    const quality = new FractureRenderColliderAnalyzer().analyzeCommittedEvent(
      baked.scene,
      baked.scene.physics!.rigidBakes[0].id,
    )
    expect(quality).toMatchObject({ status: 'pass', renderPolygonCount: 4, colliderPolygonCount: 4 })
  })

  it('persists the realized impact tick and explicit artistic explosion through direct MCP bake', async () => {
    const baked = await prepareMCPVoronoiBake(fixture(), {
      sourceLayerId: 'box', staticLayerIds: ['floor'], timelineId: 'main',
      durationMs: 1000, fragmentCount: 4, seed: 9, generationId: 'impact-mcp-v1',
      stepHz: 120, sampleFps: 30, gravity: { x: 0, y: 9.81 },
      fractureTrigger: {
        kind: 'impact', minimumRelativeNormalSpeedPxPerSecond: 50, colliderLayerIds: ['floor'],
      },
      explosion: {
        centerLocalOffsetPx: { x: 0, y: 0 }, radialVelocityPxPerSecond: 120,
        directionDeg: 270, directionalVelocityPxPerSecond: 20,
        spinVelocityDegPerSecond: 90, variation: .1, seed: 11,
      },
    })
    const recipe = baked.scene.physics!.rigidBakes[0].recipe
    const event = recipe.fractureEvents![0]

    expect(event).toMatchObject({
      trigger: { kind: 'impact', minimumRelativeNormalSpeedPxPerSecond: 50 },
      realization: { kind: 'impact', contactBodyId: 'rigid:floor' },
      explosion: { radialVelocityPxPerSecond: 120, seed: 11 },
    })
    expect(event.tick).toBeGreaterThan(0)
    expect(event.timeMs).toBeGreaterThan(0)
    expect(baked.recipeHash).toBe(recipe.recipeHash)
  })

  it('reports the realized recipe hash for a persistent impact preview and commit', async () => {
    const editor = fakeEditor('Persistent impact owner')
    editor.replaceDocument(fixture())
    try {
      const started = await editor.call('prepare_voronoi_fracture_bake', {
        sourceLayerId: 'box', staticLayerIds: ['floor'], timelineId: 'main',
        durationMs: 1000, stepHz: 120, sampleFps: 30,
        fragmentCount: 4, seed: 9, generationId: 'persistent-impact-v1',
        fractureTrigger: {
          kind: 'impact', minimumRelativeNormalSpeedPxPerSecond: 50, colliderLayerIds: ['floor'],
        },
        explosion: {
          centerLocalOffsetPx: { x: 0, y: 0 }, radialVelocityPxPerSecond: 120,
          directionDeg: 270, directionalVelocityPxPerSecond: 20,
          spinVelocityDegPerSecond: 90, variation: .1, seed: 11,
        },
      })
      const authoredHash = started.bakeJob.recipeHash
      let status = started.bakeJob
      for (let attempt = 0; attempt < 100 && status.status !== 'preview-ready'; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 0))
        status = (await editor.call('get_bake_job', { jobId: started.bakeJob.jobId })).bakeJob
      }
      expect(status.status).toBe('preview-ready')
      expect(status.recipeHash).toBe(status.report.recipeHash)
      expect(status.recipeHash).not.toBe(authoredHash)
      const sampled = await editor.call('preview_bake_job', { jobId: status.jobId })
      expect(sampled.preview.event).toMatchObject({ tick: expect.any(Number), timeMs: expect.any(Number) })

      await editor.call('commit_bake_job', { jobId: status.jobId })
      const record = editor.host.editor.getScene().physics!.rigidBakes[0]
      expect(record.recipe.recipeHash).toBe(status.recipeHash)
      expect(record.recipe.fractureEvents![0].realization).toMatchObject({
        kind: 'impact', contactBodyId: 'rigid:floor',
      })
      const inspected = (await editor.call('inspect_physics_bake', { recordId: record.id })).bake
      expect(inspected.topologyEvent).toMatchObject({
        sourceBodyId: 'rigid:box',
        fragmentBodyIds: expect.any(Array),
        tick: record.recipe.fractureEvents![0].tick,
      })
      expect(inspected.renderColliderQuality).toMatchObject({
        status: 'pass',
        atEvent: true,
        renderPolygonCount: 4,
        colliderPolygonCount: 4,
      })
      expect(inspected.renderColliderQuality.maxBoundaryDeltaPx).toBeCloseTo(0, 9)
    } finally {
      await editor.close()
    }
  })

  it('runs a persistent preview/status/sample/commit lifecycle through the real broker bridge', async () => {
    const editor = fakeEditor('Persistent bake client')
    editor.replaceDocument(fixture())
    try {
      const started = await editor.call('prepare_rigid_body_bake', {
        timelineId: 'main', durationMs: 200, stepHz: 60, sampleFps: 30,
        bodies: [
          { layerId: 'box', motionType: 'dynamic' },
          { layerId: 'floor', motionType: 'static' },
        ],
      })
      const jobId = started.bakeJob.jobId
      expect(jobId).toMatch(/^bake-/)
      let status = started.bakeJob
      for (let attempt = 0; attempt < 100 && status.status !== 'preview-ready'; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 0))
        status = (await editor.call('get_bake_job', { jobId })).bakeJob
      }
      expect(status).toMatchObject({ status: 'preview-ready', report: { sampleCount: 7, bodyCount: 2 } })
      const sampled = await editor.call('preview_bake_job', { jobId, timeMs: 100 })
      expect(sampled.preview).toMatchObject({ jobId, timeMs: 100, bodies: expect.arrayContaining([
        expect.objectContaining({ layerId: 'box', visible: true }),
      ]) })

      const committed = await editor.call('commit_bake_job', { jobId })
      expect(committed.bakeJob.status).toBe('completed')
      expect(editor.host.editor.getScene().timelines[0].tracks).toHaveLength(3)
      expect(editor.historyLength()).toBe(1)
      const discarded = await editor.call('discard_bake_job', { jobId })
      expect(discarded.discarded).toBe(true)
      await expect(editor.call('get_bake_job', { jobId })).rejects.toThrow(/not found/)
    } finally {
      await editor.close()
    }
  })

  it('keeps persistent job ids private to their creating MCP connection', async () => {
    const editor = fakeEditor('Bake owner')
    editor.replaceDocument(fixture())
    const stranger = editor.createClient('Other client')
    try {
      const started = await editor.call('prepare_rigid_body_bake', {
        timelineId: 'main', durationMs: 200, stepHz: 60, sampleFps: 30,
        bodies: [{ layerId: 'box', motionType: 'dynamic' }],
      })
      await expect(stranger.rawCall('get_bake_job', { jobId: started.bakeJob.jobId }))
        .rejects.toThrow(/not found for this MCP client/)
      expect((await editor.call('cancel_bake_job', { jobId: started.bakeJob.jobId })).bakeJob.status).toBe('cancelled')
    } finally {
      await editor.close()
    }
  })

  it('inspects, explicitly replaces and clears edited bake ownership through MCP', async () => {
    const editor = fakeEditor('Bake lifecycle owner')
    editor.replaceDocument(fixture())
    const recordId = 'mcp-rigid-lifecycle-v1'
    try {
      await editor.call('bake_rigid_bodies', {
        timelineId: 'main', durationMs: 200, stepHz: 60, sampleFps: 30, recordId,
        bodies: [
          { layerId: 'box', motionType: 'dynamic' },
          { layerId: 'floor', motionType: 'static' },
        ],
      })
      expect((await editor.call('inspect_physics_bake', { recordId })).bake)
        .toMatchObject({ ownershipState: 'current', sourceState: 'current', canSafelyMutate: true })

      const baked = editor.host.editor.getScene()
      const edited: ChronoScene = {
        ...baked,
        timelines: baked.timelines.map(timeline => timeline.id === 'main' ? {
          ...timeline,
          tracks: timeline.tracks.map((track, trackIndex) => trackIndex === 0 ? {
            ...track,
            keyframes: track.keyframes.map((key, keyIndex) => keyIndex === 0
              ? { ...key, value: Number(key.value) + 5 }
              : key),
          } : track),
        } : timeline),
      }
      editor.replaceDocument(edited, editor.host.editor.getRevision())
      expect((await editor.call('inspect_physics_bake', { recordId })).bake.ownershipState).toBe('edited')
      await expect(editor.call('clear_physics_bake', { recordId })).rejects.toThrow(/Choose Replace edited bake/)

      const started = await editor.call('prepare_rigid_body_bake', {
        timelineId: 'main', durationMs: 200, stepHz: 60, sampleFps: 30,
        replaceRecordId: recordId,
        bodies: [
          { layerId: 'box', motionType: 'dynamic' },
          { layerId: 'floor', motionType: 'static' },
        ],
      })
      const jobId = started.bakeJob.jobId
      let status = started.bakeJob
      for (let attempt = 0; attempt < 100 && status.status !== 'preview-ready'; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 0))
        status = (await editor.call('get_bake_job', { jobId })).bakeJob
      }
      expect(status).toMatchObject({ status: 'preview-ready', replaceRecordId: recordId })
      await editor.call('commit_bake_job', { jobId, replaceEdited: true })
      expect((await editor.call('inspect_physics_bake', { recordId })).bake.ownershipState).toBe('current')
      expect(editor.host.editor.getScene().physics?.rigidBakes).toHaveLength(1)

      await editor.call('undo')
      expect((await editor.call('inspect_physics_bake', { recordId })).bake.ownershipState).toBe('edited')
      await editor.call('clear_physics_bake', { recordId, discardEdited: true })
      expect(editor.host.editor.getScene().physics).toBeUndefined()
      expect(editor.host.editor.getScene().timelines[0].tracks).toHaveLength(0)
      await editor.call('undo')
      expect((await editor.call('inspect_physics_bake', { recordId })).bake.ownershipState).toBe('edited')
    } finally {
      await editor.close()
    }
  })
})
