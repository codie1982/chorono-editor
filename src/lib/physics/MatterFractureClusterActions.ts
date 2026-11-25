import type { FractureBond, FractureBondGraph } from '@/lib/types/fractureCluster'
import type { RigidBodyBakeRecipe } from '@/lib/types/physics'

type ClusterRecipe = NonNullable<RigidBodyBakeRecipe['fractureClusters']>[number]

/**
 * Owns fixed-tick authored action cursors for FRACTURE2 Matter simulation.
 *
 * The caller owns bodies and damage values. This class only determines when a
 * canonical action becomes due and marks it consumed after the caller confirms
 * the target graph/component is active. Overdue impact actions therefore wait
 * until topology activation instead of disappearing.
 */
export class MatterFractureClusterActions {
  private readonly recipesByGraphId = new Map<string, ClusterRecipe>()
  private readonly processedKeys = new Set<string>()

  constructor(recipes: readonly ClusterRecipe[]) {
    recipes.forEach(recipe => this.recipesByGraphId.set(recipe.graph.graphId, recipe))
  }

  /** Apply due graph-wide or per-bond damage resets before this tick's load. */
  applyDamageResets(
    elapsedMs: number,
    hasActiveGraph: (graphId: string) => boolean,
    reset: (graph: FractureBondGraph, bondId?: string) => void,
  ): void {
    this.recipesByGraphId.forEach(recipe => recipe.damageResets?.forEach(action => {
      const key = `${recipe.graph.graphId}:reset:${action.timeMs}:${action.bondId ?? '*'}`
      if (this.processedKeys.has(key) || action.timeMs > elapsedMs + 1e-7
        || !hasActiveGraph(recipe.graph.graphId)) return
      reset(recipe.graph, action.bondId)
      this.processedKeys.add(key)
    }))
  }

  /** Apply due forced breaks after activation; callback false defers the action. */
  applyForcedBreaks(
    elapsedMs: number,
    apply: (graphId: string, bond: FractureBond) => boolean,
  ): void {
    this.recipesByGraphId.forEach(recipe => recipe.forcedBreaks?.forEach(action => {
      const key = `${recipe.graph.graphId}:force:${action.timeMs}:${action.bondId}`
      if (this.processedKeys.has(key) || action.timeMs > elapsedMs + 1e-7) return
      const bond = recipe.graph.bonds.find(candidate => candidate.bondId === action.bondId)
      if (!bond || !apply(recipe.graph.graphId, bond)) return
      this.processedKeys.add(key)
    }))
  }

  /** Release action cursors when the owning backend is disposed. */
  dispose(): void {
    this.processedKeys.clear()
    this.recipesByGraphId.clear()
  }
}
