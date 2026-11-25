import type { MeshSnapshot } from '../poly/meshSnapshot'
import type { PolySelectionMode } from '../poly/editSelection'

export type ModifierJson = string | number | boolean | null | readonly ModifierJson[] | { readonly [key: string]: ModifierJson }

/** Registry metadata is distinct from a saved modifier instance. Algorithms
 * are enabled only when a matching evaluator and source capability exist. */
export interface ModifierDefinition {
  readonly kind: string
  readonly toolVersion: number
  readonly label: string
  readonly supportedModes: readonly ('vertex' | 'edge' | 'border' | 'polygon' | 'element' | 'object')[]
}

/** Portable parameters for a single modifier implementation. The first
 * production instance will be Edit Poly after a geometry operation commits. */
export interface ModifierInstance {
  readonly id: string
  readonly kind: string
  readonly toolVersion: number
  readonly parameters: Readonly<Record<string, ModifierJson>>
}

/** A target-owned, ordered application references a definition and instance.
 * Array position is the only evaluation order; IDs survive reorder and Undo. */
export interface ModifierApplication {
  readonly id: string
  readonly objectId: string
  readonly instanceId: string
  readonly enabled: boolean
  readonly operations?: readonly PolyOperation[]
}

/** Replayable Edit Poly substep. inputFingerprint guards selections whose
 * topology was invalidated by an earlier operation or parameter edit. */
export interface PolyOperation {
  readonly id: string
  readonly kind: string
  readonly toolVersion: number
  readonly mode: PolySelectionMode
  readonly selectionIds: readonly string[]
  readonly parameters: Readonly<Record<string, ModifierJson>>
  readonly inputFingerprint: string
  readonly references?: readonly { readonly objectId: string; readonly revision: string }[]
  readonly seed?: number
}

export type EvaluationDiagnostic = { readonly code: 'unsupported' | 'invalid-topology' | 'needs-rebind' | 'budget-exceeded'; readonly message: string; readonly operationId?: string }
export type ModifierEvaluation = { readonly mesh: MeshSnapshot; readonly idMap: Readonly<Record<string, string | null>>;
  readonly selectedIds: readonly string[]; readonly changedChannels: readonly ('topology' | 'positions' | 'uv' | 'normals' | 'materials')[];
  readonly diagnostics: readonly EvaluationDiagnostic[] }

/** Pure evaluator contract for a versioned operation. Implementations must
 * never mutate input and must return a new snapshot plus identity remap.
 * Preview calls always start from the operation-entry snapshot. */
export interface PolyOperationEvaluator {
  readonly kind: string
  readonly toolVersion: number
  evaluate(input: MeshSnapshot, operation: PolyOperation): ModifierEvaluation
}

/** Deterministic connectivity fingerprint; positions and dimensions are
 * excluded so parametric resizing preserves stable subobject IDs. */
export function topologyFingerprint(mesh: MeshSnapshot): string {
  const generator = 'generatorVersion' in mesh ? mesh.generatorVersion : 'custom'
  const kind = 'sourceKind' in mesh ? mesh.sourceKind : 'custom'
  return `${generator}:${kind}|${mesh.faces.map(face => `${face.id}:${face.corners.map(corner => corner.vertexId).join(',')}`).join('|')}`
}
