import type { Mesh2DTopology } from '@/lib/types/mesh2d'
import { hashCanonicalRecords } from '@/lib/hash/CanonicalRecordHash'

/**
 * Produces a deterministic connectivity change detector for Mesh2D topology.
 *
 * The hash includes the schema, stable vertex ids and triangle ordering, but not
 * positions or UVs: moving existing vertices does not change connectivity. Two
 * independent 32-bit FNV-1a passes reduce accidental collisions while keeping
 * the implementation synchronous and browser-portable. This is not a security
 * or content-integrity hash; portable asset integrity must use the repository's
 * cryptographic format/checksum facilities.
 *
 * Instances are stateless and safe to share.
 */
export class Mesh2DTopologyHasher {
  /** Current canonical encoding version. Bump when the encoded fields change. */
  static readonly algorithmVersion = 1

  /**
   * Hashes JSON-compatible topology fields without mutating input arrays.
   * Throws when an id contains the reserved record separator, which prevents
   * ambiguous canonical encodings.
   */
  hash(topology: Pick<Mesh2DTopology, 'schemaVersion' | 'vertexIds' | 'triangleIndices'>): string {
    return hashMesh2DCanonical(`mesh2d-topology-v${Mesh2DTopologyHasher.algorithmVersion}`, [
      `schema:${topology.schemaVersion}`,
      `vertices:${topology.vertexIds.length}`,
      ...topology.vertexIds,
      `triangles:${topology.triangleIndices.length}`,
      ...topology.triangleIndices.map(String),
    ])
  }
}

/**
 * Hashes a named sequence of canonical Mesh2D records.
 *
 * Callers own number formatting and field order. Scope and records may not
 * contain the reserved separator, preventing two record sequences from
 * producing the same byte stream by concatenation ambiguity. This remains a
 * deterministic change detector, not a cryptographic integrity checksum.
 */
export function hashMesh2DCanonical(scope: string, records: readonly string[]): string {
  return hashCanonicalRecords(scope, records)
}
