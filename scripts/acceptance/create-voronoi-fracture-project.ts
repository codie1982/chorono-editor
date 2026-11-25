import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { RigidBodyBakeAdapter } from '../../src/lib/bake/adapters/RigidBodyBakeAdapter'
import { emptyScene, newRectLayer } from '../../src/lib/defaults'
import { makeApplyVoronoiFractureBakeCmd } from '../../src/lib/editor/commands-voronoi-fracture-bake'
import { FractureRigidRecipeCompiler } from '../../src/lib/fracture/FractureRigidRecipeCompiler'
import { VoronoiFractureGenerator } from '../../src/lib/fracture/VoronoiFractureGenerator'
import { ResourceBudget } from '../../src/lib/resources/budget'
import type { ChronoScene, Layer } from '../../src/lib/types'
import type { RigidBodyAuthoring } from '../../src/lib/types/physics'

/** Builds the deterministic portable project used for live MCP/render review. */
async function main(): Promise<void> {
  const output = resolve(process.argv[2] ?? 'projects/voronoi-fracture-acceptance-2026-11-18.chorono.json')
  const panel: Layer = {
    ...newRectLayer(),
    id: 'fracture-panel',
    name: 'Voronoi Panel Source',
    size: { width: 300, height: 180 },
    transform: { x: 300, y: 55, scaleX: 1, scaleY: 1, rotationDeg: -8, anchorX: 150, anchorY: 90 },
    opacity: 1,
    style: { fill: { type: 'solid', color: '#22D3EE' }, stroke: { color: '#0E7490', width: 2 }, cornerRadius: 0 },
  }
  const floor: Layer = {
    ...newRectLayer(),
    id: 'fracture-floor',
    name: 'Static Floor',
    size: { width: 760, height: 36 },
    transform: { x: 70, y: 560, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 380, anchorY: 18 },
    opacity: 1,
    style: { fill: { type: 'solid', color: '#334155' }, cornerRadius: 0 },
  }
  const base = emptyScene()
  const scene: ChronoScene = {
    ...base,
    composition: {
      ...base.composition,
      id: 'voronoi-fracture-acceptance',
      width: 900,
      height: 650,
      durationMs: 3000,
      frameRate: 30,
      backgroundColor: '#07111F',
    },
    layers: [panel, floor],
    timelines: [{ id: 'main', durationMs: 3000, autoplay: false, loop: false, tracks: [], layerIds: [] }],
  }
  const generation = new VoronoiFractureGenerator().generate({
    generationId: 'acceptance-generation-v1',
    sourceOwnerId: panel.id,
    sourcePolygon: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 180 }, { x: 0, y: 180 }],
    fragmentCount: 16,
    seed: 20261118,
  })
  const material = { densityKgPerSquareMeter: 8, friction: .35, restitution: .18, airFriction: .002 }
  const sourceBody: RigidBodyAuthoring = {
    layerId: panel.id, motionType: 'dynamic', collider: 'rectangle', material,
    initialVelocityPxPerSecond: { x: 35, y: 0 }, initialAngularVelocityDegPerSecond: 45,
  }
  const floorBody: RigidBodyAuthoring = {
    layerId: floor.id, motionType: 'static', collider: 'rectangle', material,
    initialVelocityPxPerSecond: { x: 0, y: 0 }, initialAngularVelocityDegPerSecond: 0,
  }
  const recipe = new FractureRigidRecipeCompiler().compile(scene, {
    generation,
    timelineId: 'main',
    startTimeMs: 0,
    durationMs: 3000,
    fractureTimeMs: 600,
    stepHz: 120,
    sampleFps: 30,
    pixelsPerMeter: 100,
    gravityMetersPerSecondSquared: { x: 0, y: 9.81 },
    sourceBody,
    staticBodies: [floorBody],
  })
  const preview = await new RigidBodyBakeAdapter({
    allocator: new ResourceBudget({ maxBytes: 64 * 1024 ** 2 }),
    yieldEveryTicks: 128,
  }).prepare(recipe, { signal: new AbortController().signal, reportProgress: () => {} })
  try {
    const committed = makeApplyVoronoiFractureBakeCmd({
      generation,
      recipe,
      tracks: preview.tracks,
      sampleCount: preview.report.sampleCount,
      recordId: 'acceptance-voronoi-fracture-v1',
    }).execute(scene)
    await writeFile(output, `${JSON.stringify(committed, null, 2)}\n`, 'utf8')
    process.stdout.write(`${JSON.stringify({
      output,
      fragments: generation.fragments.length,
      topologyHash: generation.topologyHash,
      samples: preview.report.sampleCount,
      tracks: preview.tracks.length,
      keyframes: preview.report.keyframeCount,
    })}\n`)
  } finally {
    preview.release()
  }
}

void main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
