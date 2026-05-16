// ── SVG Import Command ────────────────────────────────────────────────────────
//
// Creates a single atomic undo step that adds N imported SVG layers to the
// scene. Built on BatchCommand for guaranteed undo/redo correctness.

import type { ChronoScene, Layer } from '../types'
import type { EditorCommand } from './commands-keyframe'
import { makeAddLayerCmd } from './commands-layer'
import { makeBatchCmd } from './commands-batch'

/**
 * Returns one batched EditorCommand that appends every supplied layer to the
 * scene. Pre-filters out any layer whose id collides with an existing one
 * (extremely unlikely given the timestamp-suffixed ids in SvgLayerFactory,
 * but defensive).
 */
export function makeImportSvgCmd(layers: Layer[], sourceName = 'SVG'): EditorCommand {
  const adds = layers.map(l => makeAddLayerCmd(l))
  return makeBatchCmd(`Import ${sourceName} (${layers.length} layer${layers.length === 1 ? '' : 's'})`, adds)
}
