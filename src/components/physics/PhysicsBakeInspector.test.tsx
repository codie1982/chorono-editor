import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RigidBodyBakeAdapter } from '@/lib/bake/adapters/RigidBodyBakeAdapter'
import { rigidBakeFixture } from '@/lib/bake/__tests__/RigidBodyBakeFixture'
import { makeApplyRigidBodyBakeCmd } from '@/lib/editor/commands-rigid-body-bake'
import { prepareMCPVoronoiBake } from '@/lib/mcp/bake/MCPRigidBake'
import { RigidBakeOwnershipInspector } from '@/lib/physics/RigidBakeOwnership'
import { ResourceBudget } from '@/lib/resources/budget'
import type { ChronoScene } from '@/lib/types'
import PhysicsBakeInspector from './PhysicsBakeInspector'
import type { PhysicsBakeController } from './usePhysicsBakeController'

describe('PhysicsBakeInspector', () => {
  it('shows textual ownership/source status and explicit lifecycle actions', async () => {
    const { scene, recipe } = rigidBakeFixture()
    const preview = await new RigidBodyBakeAdapter({ allocator: new ResourceBudget({ maxBytes: 8 * 1024 ** 2 }) })
      .prepare(recipe, { signal: new AbortController().signal, reportProgress: () => {} })
    const baked = makeApplyRigidBodyBakeCmd({
      recipe,
      tracks: preview.tracks,
      sampleCount: preview.report.sampleCount,
      recordId: 'inspector-rigid-v1',
    }).execute(scene)
    const html = renderToStaticMarkup(createElement(PhysicsBakeInspector, {
      scene: baked,
      controller: controllerFor(baked),
      onRebakeStarted() {},
    }))
    expect(html).toContain('Output current')
    expect(html).toContain('Source current')
    expect(html).toContain('Re-bake…')
    expect(html).toContain('Clear bake…')
    expect(html).toContain('min-h-11')

    const edited = editFirstTrack(baked)
    const editedHtml = renderToStaticMarkup(createElement(PhysicsBakeInspector, {
      scene: edited,
      controller: controllerFor(edited),
      onRebakeStarted() {},
    }))
    expect(editedHtml).toContain('Output edited')
    expect(editedHtml).toContain('ownership issue')
    expect(editedHtml).toContain('A generated track was edited after baking.')
    preview.release()
  })

  it('keeps realized impact and artistic external energy inspectable after commit', async () => {
    const fixture = rigidBakeFixture()
    const source = {
      ...fixture.scene,
      layers: fixture.scene.layers.map(layer => layer.id === 'box'
        ? { ...layer, style: { ...layer.style!, cornerRadius: 0 } }
        : layer),
    }
    const baked = await prepareMCPVoronoiBake(source, {
      sourceLayerId: 'box', staticLayerIds: ['floor'], timelineId: 'main',
      durationMs: 2000, stepHz: 120, sampleFps: 30,
      fragmentCount: 8, seed: 42, generationId: 'impact-inspector',
      fractureTrigger: {
        kind: 'impact', minimumRelativeNormalSpeedPxPerSecond: 50, colliderLayerIds: ['floor'],
      },
      explosion: {
        centerLocalOffsetPx: { x: 0, y: 0 }, radialVelocityPxPerSecond: 180,
        directionDeg: 270, directionalVelocityPxPerSecond: 20,
        spinVelocityDegPerSecond: 180, variation: .15, seed: 20261121,
      },
    })
    const html = renderToStaticMarkup(createElement(PhysicsBakeInspector, {
      scene: baked.scene,
      controller: controllerFor(baked.scene),
      onRebakeStarted() {},
    }))

    expect(html).toContain('Fracture trigger')
    expect(html).toContain('Impact')
    expect(html).toContain('Minimum speed')
    expect(html).toContain('Measured speed')
    expect(html).toContain('rigid:floor')
    expect(html).toContain('Artistic explosion · external energy')
    expect(html).toContain('20261121')
    expect(html).toContain('Topology &amp; collider')
    expect(html).toContain('Collider aligned')
    expect(html).toContain('Atomic event')
  })

  it('shows bonded graph material and realized component breaks', async () => {
    const fixture = rigidBakeFixture()
    const source = {
      ...fixture.scene,
      layers: fixture.scene.layers.map(layer => layer.id === 'box'
        ? { ...layer, style: { ...layer.style!, cornerRadius: 0 } }
        : layer),
    }
    const baked = await prepareMCPVoronoiBake(source, {
      sourceLayerId: 'box', staticLayerIds: ['floor'], timelineId: 'main',
      durationMs: 1800, fractureTimeMs: 100, stepHz: 120, sampleFps: 30,
      fragmentCount: 6, seed: 42, generationId: 'inspector-cluster',
      cluster: { defaults: { impulseStrength: .001, damageThreshold: .001,
        relativeNormalSpeedScale: 1, variation: 0 } },
    })
    const html = renderToStaticMarkup(createElement(PhysicsBakeInspector, {
      scene: baked.scene,
      controller: controllerFor(baked.scene),
      onRebakeStarted() {},
    }))

    expect(html).toContain('Bonded cluster')
    expect(html).toContain('Compound body')
    expect(html).toContain('Fragments / bonds')
    expect(html).toContain('Breaks / component splits')
    expect(html).toMatch(/\d+ broken/)
  })
})

function controllerFor(scene: ChronoScene): PhysicsBakeController {
  return {
    snapshot: null,
    descriptor: null,
    start() {},
    startRebake() {},
    cancel() {},
    discard() {},
    checkSource: () => true,
    inspectBake: recordId => new RigidBakeOwnershipInspector().inspect(scene, recordId),
    clearBake() {},
    commit: async () => {},
  }
}

function editFirstTrack(scene: ChronoScene): ChronoScene {
  return {
    ...scene,
    timelines: scene.timelines.map((timeline, timelineIndex) => timelineIndex === 0 ? {
      ...timeline,
      tracks: timeline.tracks.map((track, trackIndex) => trackIndex === 0 ? {
        ...track,
        keyframes: track.keyframes.map((key, keyIndex) => keyIndex === 0
          ? { ...key, value: Number(key.value) + 1 }
          : key),
      } : track),
    } : timeline),
  }
}
