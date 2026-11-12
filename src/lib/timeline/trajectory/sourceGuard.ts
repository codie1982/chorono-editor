import type { ChronoScene, Layer, Track } from '../../types'
import { LayerIndex } from '../../scene/LayerIndex'
import type { TrajectoryCommandScope } from './commandTypes'

/** Capture only source records used by trajectory projection/capability. Layer
 * and ancestor records are immutable references; relevant track arrays and
 * evaluator settings retain identity through command undo/redo. Timeline clock
 * primitives/order and transform bindings are included. An unrelated layer name,
 * opacity track or marker edit remains admissible and is preserved by the patch.
 * Recreated relevant source records require re-preparation, including after load. */
export function trajectorySourceGuard(base: ChronoScene, scope: TrajectoryCommandScope): (current: ChronoScene) => void {
  const index = new LayerIndex(base.layers), layers: Layer[] = []
  let layer = index.get(scope.layerId)
  const seen = new Set<string>()
  while (layer && !seen.has(layer.id)) {
    layers.push(layer); seen.add(layer.id)
    layer = layer.parentId ? index.get(layer.parentId) : undefined
  }
  const ids = new Set(layers.map(value => value.id))
  const relevant = (target: string) => Array.from(ids).some(id => target.startsWith(`layers.${id}.transform.`))
  const clocks = (scene: ChronoScene) => scene.timelines.filter(timeline => timeline.id === scope.timelineId || timeline.tracks.some(track => relevant(track.target)))
    .map(timeline => ({ id: timeline.id, durationMs: timeline.durationMs, loop: timeline.loop,
      pingPong: timeline.pingPong, loopCount: timeline.loopCount,
      tracks: timeline.tracks.filter(track => relevant(track.target)) }))
  const before = clocks(base)
  const bindings = (scene: ChronoScene) => scene.bindings.filter(binding => binding.target.type === 'layerProperty'
    && ids.has(binding.target.layerId ?? '') && binding.target.property?.startsWith('transform.'))
  const wires = (scene: ChronoScene) => (scene.parameterWires ?? []).filter(wire => ids.has(wire.target.layerId ?? '')
    && wire.target.propertyPath.startsWith('transform.'))
  const beforeBindings = bindings(base), beforeWires = wires(base)
  return current => {
    const currentIndex = new LayerIndex(current.layers), after = clocks(current)
    const stale = layers.some(value => currentIndex.get(value.id) !== value)
      || before.length !== after.length
      || before.some((clock, i) => {
        const next = after[i]
        return clock.id !== next.id || clock.durationMs !== next.durationMs || clock.loop !== next.loop
          || clock.pingPong !== next.pingPong || clock.loopCount !== next.loopCount
          || clock.tracks.length !== next.tracks.length || clock.tracks.some((track, j) => !sameTrackSource(track, next.tracks[j]))
      }) || !sameReferences(beforeBindings, bindings(current)) || !sameReferences(beforeWires, wires(current))
    if (stale) throw new Error('The trajectory source, parent transform or timeline clock changed. Read the current scene and prepare the edit again.')
  }
}

/** Compare actual interpolation inputs, allowing unrelated display labels to
 * change while refusing any source array/controller/easing/modifier replacement. */
function sameTrackSource(a: Track, b: Track): boolean {
  return a.target === b.target && a.keyframes === b.keyframes && a.kind === b.kind
    && a.controller === b.controller && a.outOfRange === b.outOfRange
    && a.easeCurve === b.easeCurve && a.timeWarp === b.timeWarp
    && a.multiplierCurve === b.multiplierCurve && a.multiplierAmplitude === b.multiplierAmplitude
    && a.modifiers === b.modifiers
}

/** Ordered references preserve evaluator precedence without serializing data. */
function sameReferences<T>(a: readonly T[], b: readonly T[]): boolean { return a.length === b.length && a.every((value, i) => value === b[i]) }
