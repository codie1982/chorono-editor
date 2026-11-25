import type { Mesh2DGeometry } from '../../types/mesh2d'
import { hashCanonicalRecords } from '../../hash/CanonicalRecordHash'

/** Identity of ordered connectivity and rest positions, in source-local px.
 * A topology hash alone cannot detect an upstream resize; baked absolute-position
 * clips and pinned rest states must not silently attach to that changed source. */
export function meshModifierRestIdentity(geometry: Mesh2DGeometry): string {
  return hashCanonicalRecords('modifier-mesh-rest-v1', [geometry.topology.topologyHash, ...geometry.positions.map(value => String(value))])
}
