// ── Repeater Modifier Commands (BL-59 Phase 2) ────────────────────────────────
//
// Non-destructive array workflow built on top of the existing 'repeater'
// layer type + RepeaterResolver render plugin:
//
//   makeConvertToRepeaterCmd — wrap a source layer in a fresh repeater
//                              layer. Source stays in the scene but is
//                              hidden (`hidden = true`); the repeater
//                              renders N transformed copies of it.
//
//   makeBakeRepeaterCmd      — collapse a repeater layer into individual
//                              real clones (one per instance). The source
//                              becomes visible again.
//
// Supports Linear and Radial patterns from ArraySettings. Grid and Path
// patterns fall back to destructive Array (the renderer doesn't support
// 2D grid or path-based repetition yet).

import type { ChronoScene, Layer, RepeaterLayerData, RepeaterMode } from '../types'
import type { EditorCommand } from './commands-keyframe'
import { makeBatchCmd } from './commands-batch'
import { makeAddLayerCmd, makeUpdateLayerCmd } from './commands-layer'
import { defaultRepeaterResolver } from '../repeater/RepeaterResolver'
import { cloneLayerForDuplicate } from '../defaults'
import type {
  ArraySettings,
  LinearArraySettings,
  RadialArraySettings,
} from '../array/ArrayTypes'

/** Repeater wrapper ids — keep them distinct from auto-incremented layer ids. */
let repeaterIdCounter = 0
function nextRepeaterId(): string {
  repeaterIdCounter++
  return `repeater_${Date.now()}_${repeaterIdCounter}`
}

// ── Settings → RepeaterLayerData ────────────────────────────────────────────

/**
 * Convert ArraySettings (Linear or Radial) into a RepeaterLayerData
 * compatible with the existing renderer. Returns null when the pattern
 * is unsupported by the non-destructive renderer (Grid, Path).
 */
export function arraySettingsToRepeaterData(
  source: Layer,
  settings: ArraySettings,
): RepeaterLayerData | null {
  if (settings.pattern === 'linear') {
    return linearToRepeater(source, settings)
  }
  if (settings.pattern === 'radial') {
    return radialToRepeater(source, settings)
  }
  return null
}

function linearToRepeater(
  source: Layer,
  settings: LinearArraySettings,
): RepeaterLayerData {
  const denom = Math.max(1, settings.count - 1)
  const stepX = settings.transformMode === 'incremental'
    ? settings.move.x
    : settings.move.x / denom
  const stepY = settings.transformMode === 'incremental'
    ? settings.move.y
    : settings.move.y / denom
  const stepRot = settings.transformMode === 'incremental'
    ? settings.rotationDeg
    : settings.rotationDeg / denom

  return {
    sourceLayerId: source.id,
    count:         settings.count,
    mode:          'linear' satisfies RepeaterMode,
    transformStep: {
      x: stepX,
      y: stepY,
      rotation: stepRot,
      scaleX: settings.scale.x,
      scaleY: settings.scale.y,
    },
  }
}

function radialToRepeater(
  source: Layer,
  settings: RadialArraySettings,
): RepeaterLayerData {
  // The existing renderer puts instances along startAngle..endAngle —
  // when closed=true we add one extra step so the last copy doesn't
  // overlap the first.
  const endAngle = settings.closed
    ? settings.startAngleDeg + settings.totalAngleDeg - (settings.totalAngleDeg / settings.count)
    : settings.startAngleDeg + settings.totalAngleDeg

  return {
    sourceLayerId: source.id,
    count:         settings.count,
    mode:          'polar' satisfies RepeaterMode,
    polar: {
      radius:        settings.radius,
      startAngle:    settings.startAngleDeg,
      endAngle,
      orientToAngle: settings.orientToAngle,
    },
  }
}

// ── makeConvertToRepeaterCmd ────────────────────────────────────────────────

export interface MakeConvertToRepeaterCmdParams {
  source: Layer
  settings: ArraySettings
}

export function makeConvertToRepeaterCmd(
  params: MakeConvertToRepeaterCmdParams,
): EditorCommand | null {
  const data = arraySettingsToRepeaterData(params.source, params.settings)
  if (!data) return null

  // Wrapper repeater layer — sits next to the source in the layer tree.
  // Inherits the source's transform anchor (0/0 since repeater positions
  // its own instances) and inherits parentId so grouping is preserved.
  const repeaterLayer: Layer = {
    id: nextRepeaterId(),
    name: `Repeater (${params.source.name})`,
    type: 'repeater',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
    parentId: params.source.parentId,
    repeater: data,
  }

  // Hide the source so we don't double-render it under the repeater.
  const hidePatch: Partial<Layer> = { hidden: true }

  return makeBatchCmd(
    `Convert "${params.source.name}" to Repeater (${data.count} copies)`,
    [
      makeAddLayerCmd(repeaterLayer),
      makeUpdateLayerCmd(params.source.id, hidePatch, params.source),
    ],
  )
}

// ── makeBakeRepeaterCmd ─────────────────────────────────────────────────────

/**
 * Collapse a repeater layer into individual cloned layers. Each instance
 * becomes a real Layer with its own transform baked in. The source layer
 * becomes visible again. The repeater wrapper is deleted.
 *
 * Bake math: walks the same RepeaterResolver the renderer uses, so the
 * baked layout matches what was on screen pixel-for-pixel.
 */
export function makeBakeRepeaterCmd(
  repeater: Layer,
  source: Layer,
): EditorCommand | null {
  if (repeater.type !== 'repeater' || !repeater.repeater) return null

  const instances = defaultRepeaterResolver.resolve(repeater.repeater)

  // Build new layers from instances by decomposing each matrix.
  const baked: Layer[] = instances.map((inst) => {
    const decomp = inst.matrix.decompose()
    const c = cloneLayerForDuplicate(source)
    c.name = `${source.name} Bake ${inst.index + 1}`
    c.hidden = false
    c.transform = {
      ...c.transform,
      x:           source.transform.x + decomp.x,
      y:           source.transform.y + decomp.y,
      rotationDeg: source.transform.rotationDeg + decomp.rotation,
      scaleX:      source.transform.scaleX * decomp.scaleX,
      scaleY:      source.transform.scaleY * decomp.scaleY,
    }
    c.opacity = source.opacity * inst.opacityMultiplier
    return c
  })

  // Restore source visibility.
  const showPatch: Partial<Layer> = { hidden: false }

  // Remove the repeater wrapper.
  const removeRepeater: EditorCommand = {
    label: `Remove Repeater wrapper`,
    execute: (s: ChronoScene) => ({
      ...s,
      layers: s.layers.filter((l) => l.id !== repeater.id),
    }),
    undo: (s: ChronoScene) => ({ ...s, layers: [...s.layers, repeater] }),
  }

  return makeBatchCmd(
    `Bake Repeater "${repeater.name}" (${baked.length} layers)`,
    [
      removeRepeater,
      makeUpdateLayerCmd(source.id, showPatch, source),
      ...baked.map((l) => makeAddLayerCmd(l)),
    ],
  )
}
