import type { ResourceLease } from '@/lib/resources/residency'
import type { MeshDeformationClip } from '@/lib/mesh2d'

/** Managed ownership handle for one decoded binary deformation clip. */
export type MeshDeformationLease = ResourceLease<MeshDeformationClip>

/** Borrowed frame-local lookup. A missing result means cold, failed or stale. */
export interface MeshDeformationBindings {
  get(assetId: string): MeshDeformationClip | undefined
}

export interface MeshDeformationBindingRecord {
  readonly assetId: string
  readonly clip: MeshDeformationClip
  live(): boolean
}

/** Snapshot that refuses to expose a clip after its exact consumer pin leaves. */
export class MeshDeformationBindingsSnapshot implements MeshDeformationBindings {
  private readonly records = new Map<string, MeshDeformationBindingRecord>()

  constructor(records: readonly MeshDeformationBindingRecord[]) {
    records.forEach(record => { if (!this.records.has(record.assetId)) this.records.set(record.assetId, record) })
  }

  get(assetId: string): MeshDeformationClip | undefined {
    const record = this.records.get(assetId)
    return record?.live() ? record.clip : undefined
  }
}
