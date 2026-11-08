import { emptyScene, newRectLayer, newTimeline } from '@/lib/defaults'
import type { ChronoScene, Track } from '@/lib/types'

/** Small authored fixture exercises the real parameter/binding/wire/SM/segment
 * pipeline. Times are composition ms; all scene records are plain source data. */
export function runtimeFixture(mode: 'plain' | 'chain' | 'blend' | 'guard' = 'plain'): ChronoScene {
  const scene = emptyScene(), layer = newRectLayer()
  scene.composition = { ...scene.composition, width: 480, height: 270, durationMs: 5000, backgroundColor: '#111827' }
  layer.id = 'card'; layer.size = { width: 100, height: 60 }
  layer.paramBindings = { opacity: 'value' }
  scene.layers = [layer]
  scene.parameters = [{ id: 'value', name: 'Value', type: 'number', defaultValue: .2 }]
  const track = (property: string, values: [number, number]): Track => ({ target: `layers.card.${property}`, keyframes: [
    { id: `${property}-0`, timeMs: 0, value: values[0], easing: { type: 'linear' } },
    { id: `${property}-1`, timeMs: 2000, value: values[1], easing: { type: 'linear' } },
  ] })
  scene.timelines = ['idle', 'hover', 'done', 'segment'].map((id, i) => ({ ...newTimeline(), id, autoplay: false,
    durationMs: 5000, tracks: i < 3 ? [track('transform.y', [10 + i * 90, 10 + i * 90])]
      : [track('transform.scaleX', [0, 2])],
    segments: id === 'segment' ? [{ id: 'short', name: 'Short', startMs: 1000, endMs: 1100 },
      { id: 'long', name: 'Long', startMs: 1000, endMs: 1800 }] : [] }))
  scene.bindings = [{ id: 'move', source: { type: 'parameter', paramId: 'value' },
    target: { type: 'layerProperty', layerId: 'card', property: 'transform.x' },
    map: { inputMin: 0, inputMax: 1, outputMin: 40, outputMax: 300 } }]
  scene.parameterWires = [{ id: 'rotate', enabled: true, source: { propertyPath: 'value', valueType: 'number' },
    target: { layerId: 'card', propertyPath: 'transform.rotationDeg', valueType: 'number' }, expression: 'source * 90',
    blendMode: 'override', createdAt: 0, updatedAt: 0 }]
  scene.triggers = [
    { id: 'set', event: { type: 'customEvent', refId: 'set' }, actions: [{ type: 'setParam', paramId: 'value', paramValue: .75 }] },
    { id: 'drag', event: { type: 'dragMove' }, actions: [{ type: 'setParam', paramId: 'value', paramValueFrom: 'event.progress' }] },
  ]
  scene.stateMachines = [{ id: 'machine', name: 'Fixture', initialStateId: 'idle', states: [
    { id: 'idle', name: 'Idle', timelineId: 'idle' },
    { id: 'hover', name: 'Hover', timelineId: 'hover', entryActions: mode === 'chain' ? [{ type: 'emitEvent', event: 'autoDone' }] : [] },
    { id: 'done', name: 'Done', timelineId: 'done' },
  ], transitions: [
    { id: 'enter', from: 'idle', to: 'hover', trigger: mode === 'guard' ? undefined : 'enter',
      guard: mode === 'guard' ? { param: 'value', op: '>', value: .6 } : undefined, blendMs: mode === 'blend' ? 100 : 0 },
    { id: 'done', from: 'hover', to: 'done', trigger: 'autoDone' },
  ] }]
  return scene
}
