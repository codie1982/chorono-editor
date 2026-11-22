import { describe, expect, it } from 'vitest'
import { newTimeline } from '../../defaults'
import type { Timeline } from '../../types'
import { removeModelInstanceTracks, removeModelObjectTracks } from './removeInstanceTracks'

describe('removed 3D instance clip tracks', () => {
  it('prunes only the deleted instance path and retains similar IDs and other channels', () => {
    const paths = [
      'layers.scene.model3d.content.instances.second.nodes.n0.position.x',
      'layers.scene.model3d.content.instances.secondary.nodes.n0.position.x',
      'layers.scene.model3d.content.instances.primary.nodes.n0.position.x',
      'layers.scene.model3d.camera.yaw',
      'modifiers.scene.model3d.content.instances.second.scale',
    ]
    const clip: Timeline = { ...newTimeline(), tracks: paths.map((target, index) => ({ id: `t${index}`, target, keyframes: [] })) as Timeline['tracks'] }
    const result = removeModelInstanceTracks([clip], ['second'])
    expect(result[0].tracks.map(track => track.target)).toEqual(paths.slice(1))
    expect(clip.tracks).toHaveLength(paths.length)
    expect(result[0]).not.toBe(clip)
  })
  it('prunes a deleted primitive without touching another stable ID', () => {
    const paths = ['layers.scene.model3d.modeling.objectsById.boxA.position.z',
      'layers.scene.model3d.modeling.objectsById.boxAB.position.z', 'layers.scene.model3d.camera.yaw']
    const clip: Timeline = { ...newTimeline(), tracks: paths.map(target => ({ target, keyframes: [] })) }
    expect(removeModelObjectTracks([clip], [], ['boxA'])[0].tracks.map(track => track.target)).toEqual(paths.slice(1))
  })
})
