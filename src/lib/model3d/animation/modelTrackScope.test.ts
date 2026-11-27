import { describe, expect, it } from 'vitest'
import { modelPathFromTrack, modelTrackBelongsToSelection } from './modelTrackScope'

describe('private 3D animation scope', () => {
  const box = { instanceId: '@primitive', nodeId: 'box_1' }
  const node = { instanceId: 'asset_1', nodeId: 'n1' }

  it('keeps stable object tracks independent of names and axis', () => {
    expect(modelTrackBelongsToSelection('layers.owner.model3d.modeling.objectsById.box_1.position.z', box)).toBe(true)
    expect(modelTrackBelongsToSelection('layers.owner.model3d.modeling.objectsById.box_2.position.z', box)).toBe(false)
    expect(modelTrackBelongsToSelection('layers.owner.model3d.camera.pitch', box)).toBe(false)
  })

  it('shows imported node channels without attributing shared instance material to it', () => {
    expect(modelTrackBelongsToSelection('layers.owner.model3d.content.instances.asset_1.nodes.n1.rotation.y', node)).toBe(true)
    expect(modelTrackBelongsToSelection('layers.owner.model3d.content.instances.asset_1.nodes.n2.rotation.y', node)).toBe(false)
    expect(modelTrackBelongsToSelection('layers.owner.model3d.content.instances.asset_1.materials.mat.color', node)).toBe(false)
  })

  it('rejects outer 2D tracks even without a selected object', () => {
    expect(modelPathFromTrack('layers.owner.transform.position.x')).toBeNull()
    expect(modelTrackBelongsToSelection('layers.owner.transform.position.x')).toBe(false)
  })
})
