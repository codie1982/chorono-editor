import type { ChronoScene } from '../types'
import { evaluateTimelines, type OverrideMap } from '../evaluator'
import { layerRegistry } from '../registry'
import { LayerIndex } from '../scene/LayerIndex'
import { materializeRenderScene } from './materializeOverrides'
import { RenderSchemaResolver } from './RenderSchemaResolver'

/** Shared canonical schema preparation; no scene/history is retained. */
export const renderSchemas = new RenderSchemaResolver(layer => layerRegistry.findForLayer(layer) ?? layerRegistry.get(layer.type)).resolve

/** Evaluate/materialize one immutable render snapshot in composition ms. Used by
 * resource preparation and actual drawing, preserving instance/property clamps.
 * Supplied live runtime overrides are borrowed, never replaced by a second tick. */
export function prepareRenderFrame(sourceScene: ChronoScene, timeMs: number, supplied?: OverrideMap) {
  const overrides = supplied ?? evaluateTimelines(sourceScene.timelines, timeMs)
  const scene = materializeRenderScene(sourceScene, overrides, renderSchemas)
  return { sourceScene, scene, timeMs, overrides, index: new LayerIndex(scene.layers) }
}
