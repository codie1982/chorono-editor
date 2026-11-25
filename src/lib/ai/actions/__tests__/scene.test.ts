import { describe, expect, it } from 'vitest'
import { emptyScene } from '@/lib/defaults'
import type { ChronoScene } from '@/lib/types'
import { ActionRegistry } from '../../ActionRegistry'
import { clearAuthoredSceneContent, registerSceneActions } from '../scene'

describe('clear_scene', () => {
  function populatedScene(): ChronoScene {
    const scene = emptyScene()
    return {
      ...scene,
      assets: [{ id: 'asset', name: 'Reusable', type: 'image', url: 'data:image/png;base64,AA==' }],
      assetCollections: [{ id: 'collection', name: 'Reusable assets', assetIds: ['asset'] }],
      editorGuides: { version: 1, guides: [{ id: 'guide-h', axis: 'h', position: 120 }] },
      layers: [{
        id: 'box', name: 'Box', type: 'shape', shape: 'rect',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
        opacity: 1, size: { width: 40, height: 40 },
      }],
      timelines: [{ id: 'main', durationMs: 1000, loop: false, autoplay: false, tracks: [] }],
      parameters: [{ id: 'energy', name: 'Energy', type: 'number', defaultValue: 1 }],
      triggers: [{ id: 'trigger', event: { type: 'click', layerId: 'box' }, actions: [{ type: 'play', timelineId: 'main' }] }],
      bindings: [{
        id: 'binding', source: { type: 'parameter', paramId: 'energy' },
        target: { type: 'layerProperty', layerId: 'box', property: 'opacity' },
        map: { inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 1 },
      }],
      parameterWires: [{
        id: 'wire', name: 'Energy to opacity', enabled: true,
        source: { propertyPath: 'energy', valueType: 'number' },
        target: { layerId: 'box', propertyPath: 'opacity', valueType: 'number' },
        expression: 'source', blendMode: 'override', createdAt: 1, updatedAt: 1,
      }],
      stateMachines: [{
        id: 'machine', name: 'Machine', initialStateId: 'idle',
        states: [{ id: 'idle', name: 'Idle', timelineId: 'main' }], transitions: [],
      }],
      initialState: { energy: 1 },
      physics: { schemaVersion: 1, rigidBakes: [] },
      authoring: { version: 1, records: {} },
    }
  }

  it('clears layer and timeline dependants while preserving reusable project data', () => {
    const source = populatedScene()
    const cleared = clearAuthoredSceneContent(source)

    expect(cleared).toMatchObject({
      layers: [], timelines: [], parameters: [], triggers: [], bindings: [],
      parameterWires: [], stateMachines: [], initialState: {},
    })
    expect(cleared.physics).toBeUndefined()
    expect(cleared.authoring).toBeUndefined()
    expect(cleared.composition).toBe(source.composition)
    expect(cleared.assets).toBe(source.assets)
    expect(cleared.assetCollections).toBe(source.assetCollections)
    expect(cleared.editorGuides).toBe(source.editorGuides)
  })

  it('restores the exact source through the registered command Undo contract', () => {
    const registry = new ActionRegistry()
    registerSceneActions(registry)
    const source = populatedScene()
    const command = registry.get('clear_scene')!.toCommand!({}, source)!
    const cleared = command.execute(source)

    expect(cleared.physics).toBeUndefined()
    expect(command.undo(cleared)).toBe(source)
  })
})
