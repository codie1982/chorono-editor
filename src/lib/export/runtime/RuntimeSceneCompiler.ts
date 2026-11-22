import type { ChronoScene, Layer, StateMachineDefinition, Timeline } from '../../types'
import type { RuntimeAnimation } from '../../types/runtime'
import { compositionForOutput } from '../../paint/paintSource'

export interface RuntimeSceneCompilerOptions {
  /** Audio is delivered by the separate mixer/export path unless explicitly retained. */
  readonly includeAudio?: boolean
}

/**
 * Converts editable source into the complete scene graph consumed by players.
 *
 * The compiler owns field inclusion and editor-metadata removal; optimizers
 * may change tracks afterwards but must not maintain a second scene allowlist.
 * Visual `hidden` state is intentionally retained because renderers use it to
 * decide whether a layer paints. Physics recipes, ownership records, guides,
 * asset collections and authoring provenance are source-only and are omitted.
 * Composition output honors backgroundInExport through the shared paint
 * projection, while the editor's original composition remains unchanged.
 * Returned records reuse immutable nested source values; the source is never
 * mutated. Audio is excluded by default because runtime JSON and mixed audio
 * are separate Chorono deliverables.
 */
export class RuntimeSceneCompiler {
  compile(scene: ChronoScene, options: RuntimeSceneCompilerOptions = {}): RuntimeAnimation {
    const excludedLayerIds = options.includeAudio
      ? new Set<string>()
      : new Set(scene.layers.filter(layer => layer.type === 'audio').map(layer => layer.id))
    const layers = scene.layers
      .filter(layer => !excludedLayerIds.has(layer.id))
      .map(stripLayerEditorMetadata)

    return {
      formatVersion: scene.formatVersion,
      ...(scene.mode ? { mode: scene.mode } : {}),
      composition: compositionForOutput(scene.composition),
      assets: options.includeAudio ? scene.assets : scene.assets.filter(asset => asset.type !== 'audio'),
      layers,
      timelines: scene.timelines.map(timeline => stripExcludedLayerTracks(timeline, excludedLayerIds)),
      parameters: scene.parameters ?? [],
      triggers: scene.triggers,
      bindings: scene.bindings,
      ...(scene.parameterWires ? { parameterWires: scene.parameterWires } : {}),
      ...(scene.stateMachines?.length
        ? { stateMachines: scene.stateMachines.map(stripStateMachineEditorMetadata) }
        : {}),
      initialState: scene.initialState,
    }
  }
}

/** Removes authoring-only flags while preserving visual visibility. */
function stripLayerEditorMetadata(layer: Layer): Layer {
  const {
    locked: _locked,
    solo: _solo,
    pinned: _pinned,
    colorLabel: _colorLabel,
    frozen: _frozen,
    internalGrid: _internalGrid,
    inputExpressions: _inputExpressions,
    ...runtimeLayer
  } = layer
  return runtimeLayer
}

/** Removes direct tracks and memberships for audio layers excluded from JSON. */
function stripExcludedLayerTracks(timeline: Timeline, excludedLayerIds: ReadonlySet<string>): Timeline {
  if (!excludedLayerIds.size) return timeline
  const excluded = Array.from(excludedLayerIds)
  return {
    ...timeline,
    tracks: timeline.tracks.filter(track => !excluded.some(layerId => (
      track.target === `layers.${layerId}` || track.target.startsWith(`layers.${layerId}.`)
    ))),
    ...(timeline.layerIds
      ? { layerIds: timeline.layerIds.filter(layerId => !excludedLayerIds.has(layerId)) }
      : {}),
  }
}

/** Drops only editor graph coordinates from state-machine definitions. */
function stripStateMachineEditorMetadata(machine: StateMachineDefinition): StateMachineDefinition {
  return {
    ...machine,
    states: machine.states.map(state => {
      const { x: _x, y: _y, ...runtimeState } = state
      return runtimeState
    }),
  }
}

export const defaultRuntimeSceneCompiler = new RuntimeSceneCompiler()
