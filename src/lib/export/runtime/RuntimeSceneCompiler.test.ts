import { describe, expect, it } from 'vitest'
import { emptyScene, newAudioLayer, newImageLayer } from '@/lib/defaults'
import type { ChronoScene, StateMachineDefinition } from '@/lib/types'
import { RuntimeSceneCompiler } from './RuntimeSceneCompiler'

const stateMachine = (): StateMachineDefinition => ({
  id: 'machine',
  name: 'Machine',
  initialStateId: 'idle',
  states: [{ id: 'idle', name: 'Idle', timelineId: 'main', x: 80, y: 40 }],
  transitions: [],
})

describe('RuntimeSceneCompiler', () => {
  it('preserves player-visible state and removes source/editor-only records', () => {
    const scene = fixture()
    const source = structuredClone(scene)

    const runtime = new RuntimeSceneCompiler().compile(scene)
    const image = runtime.layers.find(layer => layer.id === 'image')!

    expect(runtime.assets.map(asset => asset.id)).toEqual(['poster'])
    expect(runtime.layers.map(layer => layer.id)).toEqual(['image'])
    expect(image.hidden).toBe(true)
    expect(image).not.toHaveProperty('locked')
    expect(image).not.toHaveProperty('frozen')
    expect(runtime.timelines[0].layerIds).toEqual(['image'])
    expect(runtime.timelines[0].tracks.map(track => track.target)).toEqual(['layers.image.opacity'])
    expect(runtime.parameterWires).toEqual(scene.parameterWires)
    expect(runtime.initialState).toEqual({ selectedVariant: 'hero' })
    expect(runtime.stateMachines?.[0].states[0]).not.toHaveProperty('x')
    expect(runtime.stateMachines?.[0].states[0]).not.toHaveProperty('y')
    expect(runtime).not.toHaveProperty('physics')
    expect(runtime).not.toHaveProperty('authoring')
    expect(runtime).not.toHaveProperty('assetCollections')
    expect(runtime).not.toHaveProperty('editorGuides')
    expect(scene).toEqual(source)
  })

  it('can retain audio explicitly without leaving dangling timeline references', () => {
    const runtime = new RuntimeSceneCompiler().compile(fixture(), { includeAudio: true })

    expect(runtime.assets.map(asset => asset.id)).toEqual(['poster', 'sound'])
    expect(runtime.layers.map(layer => layer.id)).toEqual(['image', 'audio'])
    expect(runtime.timelines[0].layerIds).toEqual(['image', 'audio'])
    expect(runtime.timelines[0].tracks.map(track => track.target)).toEqual([
      'layers.image.opacity',
      'layers.audio.audio.volume',
    ])
  })
})

function fixture(): ChronoScene {
  const scene = emptyScene()
  const image = {
    ...newImageLayer('poster'),
    id: 'image',
    hidden: true,
    locked: true,
    frozen: true,
  }
  const audio = { ...newAudioLayer('sound'), id: 'audio' }
  return {
    ...scene,
    assets: [
      { id: 'poster', name: 'Poster', type: 'image', url: 'data:image/png;base64,AA==' },
      { id: 'sound', name: 'Sound', type: 'audio', url: 'data:audio/wav;base64,AA==' },
    ],
    assetCollections: [{ id: 'collection', name: 'Source', assetIds: ['poster'] }],
    layers: [image, audio],
    timelines: [{
      id: 'main', durationMs: 1000, loop: false, autoplay: false,
      layerIds: ['image', 'audio'],
      tracks: [
        { target: 'layers.image.opacity', keyframes: [{ id: 'visible', timeMs: 0, value: 1, easing: { type: 'linear' } }] },
        { target: 'layers.audio.audio.volume', keyframes: [{ id: 'gain', timeMs: 0, value: 1, easing: { type: 'linear' } }] },
      ],
    }],
    parameterWires: [{
      id: 'wire', name: 'Opacity', enabled: true,
      source: { propertyPath: 'strength', valueType: 'number' },
      target: { layerId: 'image', propertyPath: 'opacity', valueType: 'number' },
      expression: 'source', blendMode: 'override', createdAt: 1, updatedAt: 1,
    }],
    stateMachines: [stateMachine()],
    initialState: { selectedVariant: 'hero' },
    editorGuides: { version: 1, guides: [] },
    physics: { schemaVersion: 1, rigidBakes: [], fractureGenerations: [] },
    authoring: { version: 1, records: {} },
  }
}
