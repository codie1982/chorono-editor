import { Modifier } from '../Modifier'
import type { GeometryModifierDescriptor, ModifierGeometry, ModifierContext } from '../geometryTypes'
import { meshModifierRestIdentity } from './restIdentity'
import { numberSetting } from '../settings'
import type { Mesh2DDeformationBinding } from '../../types/mesh2d'

/** Playback modifier over a fixed-topology binary clip. Stores only the asset
 * binding; the existing deformation resolver owns time sampling and rejects
 * missing/mismatched clips. No decoded buffers, GPU objects or frames are owned. */
export class MeshDeformationModifier extends Modifier<ModifierGeometry, ModifierContext, GeometryModifierDescriptor> {
  static readonly descriptor: GeometryModifierDescriptor = { type: 'meshDeformation', label: 'Deformation Clip', preservesSourceEditing: true, category: 'mesh', inputs: ['mesh2d'], output: 'mesh2d', addable: true,
    fields: [{ key: 'assetId', label: 'Deformation clip', kind: 'asset', assetType: 'meshDeformation' },
      { key: 'startTimeMs', label: 'Start time', kind: 'number', min: -1e9, max: 1e9, step: 1, unit: 'ms' },
      { key: 'playbackRate', label: 'Playback rate', kind: 'number', min: .001, max: 1000, step: .1 },
      { key: 'loop', label: 'Loop', kind: 'boolean' }] }
  /** Defaults for a newly owned instance; empty targets mean all eligible elements. */
  static defaults() { return { assetId: '', startTimeMs: 0, playbackRate: 1, loop: false } }
  readonly descriptor = MeshDeformationModifier.descriptor
  validate(): void {
    if (typeof this.settings.assetId !== 'string' || this.settings.assetId.length > 256 || typeof this.settings.loop !== 'boolean') throw new Error('Invalid deformation clip settings.')
    if (this.settings.restIdentity !== undefined && typeof this.settings.restIdentity !== 'string') throw new Error('Invalid deformation rest identity.')
    numberSetting(this.settings, 'startTimeMs', -1e9, 1e9); numberSetting(this.settings, 'playbackRate', .001, 1000)
    if (this.settings.topologyHash !== undefined && typeof this.settings.topologyHash !== 'string') throw new Error('Invalid deformation topology identity.')
  }
  protected evaluate(input: ModifierGeometry): ModifierGeometry {
    if (input.kind !== 'mesh2d') throw new Error('Deformation Clip requires Mesh geometry.')
    if (this.settings.assetId && this.settings.topologyHash && input.mesh.geometry.topology.topologyHash !== this.settings.topologyHash) throw new Error('Upstream Mesh topology changed. Rebind the deformation clip.')
    if (this.settings.assetId && this.settings.restIdentity && this.settings.restIdentity !== meshModifierRestIdentity(input.mesh.geometry)) throw new Error('Upstream Mesh rest positions changed. Rebind the deformation clip.')
    const deformation: Mesh2DDeformationBinding | undefined = this.settings.assetId ? { schemaVersion: 1, assetId: this.settings.assetId as string,
      startTimeMs: numberSetting(this.settings, 'startTimeMs', -1e9, 1e9), playbackRate: numberSetting(this.settings, 'playbackRate', .001, 1000), loop: this.settings.loop as boolean } : undefined
    return { kind: 'mesh2d', mesh: { ...input.mesh, deformation } }
  }
}
