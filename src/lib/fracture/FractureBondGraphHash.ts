import { canonicalJson, hashCanonicalRecords } from '@/lib/hash/CanonicalRecordHash'
import type { FractureBondGraph } from '@/lib/types/fractureCluster'

/** Hashes all portable FRACTURE2 bond graph fields except the hash itself. */
export function hashFractureBondGraph(graph: Omit<FractureBondGraph, 'graphHash'>): string {
  return hashCanonicalRecords('fracture-bond-graph-v1', [canonicalJson(graph)])
}
