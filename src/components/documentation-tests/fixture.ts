import { emptyScene, newRectLayer, newTextLayer, newCircleLayer, newBezierPathLayer,
  newParticleEmitterLayer, newTimeline, newSceneParameter, newStateMachine,
  newTrigger, newBinding, newTimelineSegment, newMarker, newSplineLayerFromPrimitive } from '@/lib/defaults'
import type { ChronoScene } from '@/lib/types'

/** Build a disposable browser fixture through production defaults. IDs and
 * millisecond key times are stable for screenshots; no user scene is loaded.
 * Every invocation owns its arrays and objects. No storage or MCP is involved. */
export function createDocumentationScene(includeSpline = false): ChronoScene {
  const scene = emptyScene()
  scene.composition = { ...scene.composition, id: 'Motion study', width: 640, height: 400, durationMs: 2400 }
  const card = newRectLayer(), dot = newCircleLayer(), text = newTextLayer(), path = newBezierPathLayer()
  scene.layers = [
    { ...card, id: 'card', name: 'Blue card', transform: { ...card.transform, x: 100, y: 120 }, size: { width: 180, height: 100 } },
    { ...dot, id: 'dot', name: 'Accent circle', transform: { ...dot.transform, x: 360, y: 180 } },
    { ...text, id: 'headline', name: 'Headline', transform: { ...text.transform, x: 100, y: 60 } },
    { ...path, id: 'path', name: 'Motion path', transform: { ...path.transform, x: 80, y: 280 },
      path: { closed: false, anchors: [{ x: 0, y: 0, outX: 80, outY: -80 }, { x: 220, y: 0, inX: 140, inY: 80 }] } },
    { ...newParticleEmitterLayer(), id: 'particles', name: 'Confetti emitter', hidden: true },
  ]
  if (includeSpline) {
    const spline = newSplineLayerFromPrimitive('circle', { radius: 80 })!
    scene.layers.push({ ...spline, id: 'spline', name: 'Editable circle' })
  }
  const timeline = newTimeline()
  scene.timelines = [{ ...timeline, id: 'intro', durationMs: 2400, layerIds: ['card', 'dot', 'headline'],
    tracks: [
      { target: 'layers.card.transform.x', keyframes: [
        { id: 'card-x-0', timeMs: 0, value: 100, easing: { type: 'easeInOut' } },
        { id: 'card-x-1', timeMs: 1200, value: 300, easing: { type: 'easeInOut' } },
        { id: 'card-x-2', timeMs: 2400, value: 100, easing: { type: 'linear' } },
      ] },
      { target: 'layers.card.opacity', keyframes: [
        { id: 'card-o-0', timeMs: 0, value: 0.4, easing: { type: 'linear' } },
        { id: 'card-o-1', timeMs: 600, value: 1, easing: { type: 'linear' } },
      ] },
      { target: 'layers.dot.transform.scaleX', keyframes: [
        { id: 'dot-s-0', timeMs: 200, value: 0.6, easing: { type: 'easeOut' } },
        { id: 'dot-s-1', timeMs: 1400, value: 1.2, easing: { type: 'linear' } },
      ] },
    ], segments: [{ ...newTimelineSegment(0, 1200), id: 'arrival', name: 'Arrival' }], markers: [newMarker(1200, 'Turn around')] }]
  scene.parameters = [{ ...newSceneParameter(), id: 'progress', name: 'Progress', defaultValue: 0.5, min: 0, max: 1 }]
  scene.stateMachines = [newStateMachine('intro', 'Card interaction')]
  scene.triggers = [{ ...newTrigger(), label: 'Play on click', event: { type: 'click', layerId: 'card' }, actions: [{ type: 'play', timelineId: 'intro' }] }]
  scene.bindings = [{ ...newBinding(), source: { type: 'parameter', paramId: 'progress' }, target: { type: 'layerProperty', layerId: 'dot', property: 'opacity' } }]
  return scene
}
