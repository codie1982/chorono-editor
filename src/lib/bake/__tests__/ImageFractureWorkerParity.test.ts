import { expect, it } from 'vitest'
import { emptyScene, newImageLayer, newRectLayer } from '@/lib/defaults'
import { PhysicsBakeRecipeFactory } from '@/lib/physics/PhysicsBakeRecipeFactory'
import { compareRigidBodyIds } from '@/lib/physics/RigidBodyEventOrdering'
import { SimulationClock } from '@/lib/simulation/SimulationClock'
import type { ChronoScene, Layer } from '@/lib/types'
import { RigidBodySimulationRunner } from '../rigid/RigidBodySimulationRunner'

it('emits worker-valid ordered events for an image fracture recipe', async () => {
  const image: Layer = {
    ...newImageLayer('poster', 300, 180),
    id: 'image_fracture_source',
    image: { assetId: 'poster', objectFit: 'cover' },
    transform: { x: 250, y: 70, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
  }
  const floor: Layer = {
    ...newRectLayer(),
    id: 'image_fracture_floor',
    size: { width: 680, height: 36 },
    transform: { x: 60, y: 390, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
  }
  const base = emptyScene()
  const scene: ChronoScene = {
    ...base,
    composition: { ...base.composition, width: 800, height: 450, durationMs: 3000, frameRate: 30 },
    assets: [{ id: 'poster', name: 'Poster.png', type: 'image', url: 'embedded:poster', width: 64, height: 40 }],
    layers: [image, floor],
    timelines: [{ id: 'image_fracture_uv_timeline', durationMs: 3000, autoplay: false, loop: false, tracks: [], layerIds: [] }],
  }
  const { recipe } = new PhysicsBakeRecipeFactory().compileVoronoi(scene, {
    sourceLayerId: image.id,
    staticLayerIds: [floor.id],
    timelineId: 'image_fracture_uv_timeline',
    durationMs: 3000,
    fractureTimeMs: 800,
    fragmentCount: 16,
    seed: 20261121,
    generationId: 'image-fracture-uv-20261121',
  })
  const result = await new RigidBodySimulationRunner({ yieldEveryTicks: 1000 }).simulate(recipe, {
    signal: new AbortController().signal,
    reportProgress: () => {},
  })
  const clock = new SimulationClock(recipe)
  const knownBodies = new Set(recipe.bodies.map(body => body.bodyId))
  const invalid = result.events.map((event, index) => ({ event, index })).filter(({ event, index }) => {
    const previous = result.events[index - 1]
    return event.tick < (previous?.tick ?? 0)
      || Math.abs(clock.timeMsForTick(event.tick) - event.timeMs) > 1e-6
      || event.bodyIds.some(bodyId => !knownBodies.has(bodyId))
      || (event.kind.startsWith('contact-') !== (event.bodyIds.length === 2))
      || (event.bodyIds.length === 2 && compareRigidBodyIds(event.bodyIds[0], event.bodyIds[1]) > 0)
  })

  expect(invalid).toEqual([])
})
