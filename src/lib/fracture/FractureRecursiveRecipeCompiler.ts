import { SimulationClock } from '@/lib/simulation/SimulationClock'
import type { ChronoScene } from '@/lib/types'
import type {
  AnyFractureGeneration,
  FractureGeneration,
  FractureGenerationBudgetLimits,
} from '@/lib/types/fracture'
import type { RigidBodyAuthoring, RigidBodyBakeRecipe, RigidBodySnapshot } from '@/lib/types/physics'
import { assertRigidFractureEvents } from '@/lib/physics/RigidFractureValidation'
import { hashRigidBodyBakeRecipe, hashRigidBodySource } from '@/lib/physics/RigidBodySceneCompiler'
import { FractureBodySnapshotCompiler } from './FractureBodySnapshotCompiler'
import { FractureGenerationHierarchyCompiler } from './FractureGenerationHierarchyCompiler'
import { FractureRigidRecipeCompiler, type FractureRigidRecipeInput } from './FractureRigidRecipeCompiler'

export interface FractureRecursiveChildInput {
  readonly generation: FractureGeneration
  /** Simulation-local milliseconds on a fixed tick, after the parent event. */
  readonly fractureTimeMs: number
}

export interface FractureRecursiveRecipeInput {
  readonly root: FractureRigidRecipeInput
  readonly children: readonly FractureRecursiveChildInput[]
  readonly budgets?: Partial<FractureGenerationBudgetLimits>
}

/**
 * Extends a canonical root fracture recipe with precomputed child events.
 *
 * Child generations are convex manifests whose source owner is an earlier
 * fragment layer. Their bodies remain inactive until a later fixed solver tick
 * replaces that live parent body. The compiler validates lineage and resource
 * budgets before adding bodies, then hashes one immutable recipe consumed by
 * the existing Matter adapter. FRACTURE2 compound clusters are intentionally
 * rejected because their virtual fragment bodies are not independently active.
 * Instances are stateless and allocate no solver resources.
 */
export class FractureRecursiveRecipeCompiler {
  private readonly rootCompiler = new FractureRigidRecipeCompiler()
  private readonly hierarchyCompiler = new FractureGenerationHierarchyCompiler()
  private readonly bodyCompiler = new FractureBodySnapshotCompiler()

  /** Compile the ordered root and child topology schedule without scene mutation. */
  compile(scene: ChronoScene, input: FractureRecursiveRecipeInput): RigidBodyBakeRecipe {
    if (!input.children.length) return this.rootCompiler.compile(scene, input.root)
    if (input.root.bondGraph) throw new Error('Recursive fracture cannot use a bonded root cluster yet')
    if (input.root.fractureTrigger?.kind === 'impact') {
      throw new Error('Recursive fracture currently requires a fixed-time root event')
    }
    const generations: AnyFractureGeneration[] = [
      input.root.generation,
      ...input.children.map(child => child.generation),
    ]
    const hierarchy = this.hierarchyCompiler.compile(generations, input.budgets)
    const root = this.rootCompiler.compile(scene, input.root)
    const clock = new SimulationClock(root)
    const bodies: RigidBodySnapshot[] = [...root.bodies]
    const events = [...(root.fractureEvents ?? [])]

    input.children.forEach(child => {
      const parent = bodies.find(body => body.layerId === child.generation.source.ownerId)
      const parentEvent = events.find(event => event.fragmentBodyIds.includes(parent?.bodyId ?? ''))
      if (!parent || !parentEvent) {
        throw new Error(`Recursive fracture parent body is missing: ${child.generation.parentId}`)
      }
      const tick = fixedTick(child.fractureTimeMs, clock)
      if (tick <= parentEvent.tick) {
        throw new Error(`Recursive fracture must occur after its parent event: ${child.generation.generationId}`)
      }
      const eventId = `${child.generation.generationId}:event`
      const fragments = this.bodyCompiler.compile(parent, child.generation, eventId)
      bodies.push(...fragments)
      events.push(Object.freeze({
        id: eventId,
        timeMs: child.fractureTimeMs,
        tick,
        sourceBodyId: parent.bodyId,
        fragmentBodyIds: Object.freeze(fragments.map(fragment => fragment.bodyId)),
        trigger: Object.freeze({ kind: 'time' as const }),
      }))
    })

    const sourceRevision = hashRigidBodySource(root.timelineId, bodies)
    const withoutHash: Omit<RigidBodyBakeRecipe, 'recipeHash'> = {
      ...root,
      source: { ...root.source, revision: sourceRevision },
      bodies: Object.freeze(bodies),
      fractureEvents: Object.freeze(events),
      fractureHierarchy: hierarchy,
    }
    const recipe = Object.freeze({ ...withoutHash, recipeHash: hashRigidBodyBakeRecipe(withoutHash) })
    assertRigidFractureEvents(recipe)
    return recipe
  }

  /** Recompile stored authoring against the current root source and compare it. */
  isCurrent(
    recipe: RigidBodyBakeRecipe,
    generations: readonly AnyFractureGeneration[],
    scene: ChronoScene,
  ): boolean {
    const hierarchy = recipe.fractureHierarchy
    const rootGeneration = generations[0]
    const rootEvent = recipe.fractureEvents?.[0]
    const source = recipe.bodies.find(body => body.bodyId === rootEvent?.sourceBodyId)
    if (!hierarchy || !rootGeneration || !rootEvent || !source || rootEvent.trigger?.kind === 'impact') return false
    try {
      const childEvents = new Map((recipe.fractureEvents ?? []).slice(1).map(event => [
        event.id.replace(/:event$/, ''), event,
      ]))
      const current = this.compile(scene, {
        root: {
          generation: rootGeneration,
          timelineId: recipe.timelineId,
          startTimeMs: recipe.startTimeMs,
          durationMs: recipe.durationMs,
          fractureTimeMs: rootEvent.timeMs,
          fractureTrigger: { kind: 'time' },
          explosion: rootEvent.explosion,
          sourceBody: authored(source),
          staticBodies: recipe.bodies.filter(body => body.motionType === 'static').map(authored),
          stepHz: recipe.stepHz,
          sampleFps: recipe.sampleFps,
          pixelsPerMeter: recipe.pixelsPerMeter,
          gravityMetersPerSecondSquared: recipe.gravityMetersPerSecondSquared,
        },
        children: generations.slice(1).map(generation => {
          if (generation.schemaVersion !== 1) throw new Error('Recursive child generation must be convex')
          const event = childEvents.get(generation.generationId)
          if (!event) throw new Error(`Recursive fracture event is missing: ${generation.generationId}`)
          return { generation, fractureTimeMs: event.timeMs }
        }),
        budgets: hierarchy.limits,
      })
      return current.recipeHash === recipe.recipeHash && current.source.revision === recipe.source.revision
    } catch {
      return false
    }
  }
}

function fixedTick(timeMs: number, clock: SimulationClock): number {
  if (!Number.isFinite(timeMs)) throw new RangeError('Recursive fracture time must be finite')
  const tick = timeMs * clock.stepHz / 1000
  if (!Number.isSafeInteger(tick) || tick < 1 || tick >= clock.totalTicks) {
    throw new RangeError('Recursive fracture time must align to an interior fixed-step tick')
  }
  return tick
}

function authored(body: RigidBodySnapshot): RigidBodyAuthoring {
  return {
    layerId: body.layerId,
    motionType: body.motionType,
    collider: body.collider,
    material: { ...body.material },
    initialVelocityPxPerSecond: { ...body.initialVelocityPxPerSecond },
    initialAngularVelocityDegPerSecond: body.initialAngularVelocityDegPerSecond,
  }
}
