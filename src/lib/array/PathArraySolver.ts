// ── PathArraySolver (BL-59 Phase 2) ───────────────────────────────────────────
//
// Distributes N clones along a 'path' layer's BezierPath, evenly spaced by
// arc length. Uses PathSampler for accurate sampling (cubic curves don't
// have uniform t-parameterization).
//
// The path layer must:
//   - have type === 'path'
//   - have a `path` field (BezierPath with at least 2 anchors)
//
// If the path layer is missing, has no path, or has fewer than 2 anchors,
// the solver returns [] (and the caller's UI shows "Pick a path").

import type { Layer } from '../types'
import type {
  ArrayInstanceTransform,
  PathArraySettings,
} from './ArrayTypes'
import { defaultPathSampler } from '../path/PathSampler'
import { bezierPathToPathDefinition } from '../path/bezierToPathDefinition'

/**
 * Resolves the BezierPath for a given path layer id. Walks `allLayers`
 * once. Returns null when the layer is missing or has no path.
 */
function resolvePathLayer(
  pathLayerId: string,
  allLayers: Layer[],
): Layer | null {
  const layer = allLayers.find((l) => l.id === pathLayerId)
  if (!layer || layer.type !== 'path' || !layer.path) return null
  if (layer.path.anchors.length < 2) return null
  return layer
}

export function solvePathArray(
  source: Layer,
  settings: PathArraySettings,
  allLayers: Layer[],
): ArrayInstanceTransform[] {
  if (settings.count <= 0) return []

  const pathLayer = resolvePathLayer(settings.pathLayerId, allLayers)
  if (!pathLayer) return []

  // Build the length table once per call. PathSampler caches by
  // PathDefinition identity — converting on every call keeps the
  // contract simple at the cost of one cubic-sampling pass.
  const def = bezierPathToPathDefinition(pathLayer.path!)
  const table = defaultPathSampler.buildLengthTable(def)
  const totalLen = table.totalLength
  if (totalLen <= 0) return []

  const usable = Math.max(0, totalLen - settings.startOffset - settings.endOffset)
  if (usable <= 0) return []

  // Step between centres along the arc.
  const spacing = settings.count > 1 ? usable / (settings.count - 1) : 0

  // Compose the path layer's own world transform so distributed points
  // land on the path as the user sees it. MVP only handles translation;
  // rotation/scale on the path layer is Phase 3.
  const pathOffsetX = pathLayer.transform.x
  const pathOffsetY = pathLayer.transform.y

  const baseRot = source.transform.rotationDeg
  const baseScaleX = source.transform.scaleX
  const baseScaleY = source.transform.scaleY
  const baseOpacity = source.opacity

  const out: ArrayInstanceTransform[] = []
  for (let i = 0; i < settings.count; i++) {
    const isSourceIndex =
      i === 0 && settings.sourcePolicy === 'include-source'

    // Walk distance — reversed if requested.
    const distIdx = settings.reverse ? settings.count - 1 - i : i
    const len = settings.startOffset + distIdx * spacing
    const sample = table.pointAtLength(len)

    // Normal offset: perpendicular to tangent (rotate tangent +90°).
    const nx = -sample.tangentY
    const ny = sample.tangentX

    const px = pathOffsetX + sample.x + nx * settings.normalOffset
    const py = pathOffsetY + sample.y + ny * settings.normalOffset

    const rotation = settings.alignToTangent
      ? sample.angle
      : baseRot

    if (isSourceIndex) {
      out.push({
        index: i,
        position: { x: source.transform.x, y: source.transform.y },
        rotation: baseRot,
        scale: { x: baseScaleX, y: baseScaleY },
        opacity: baseOpacity,
        isSourceIndex: true,
      })
      continue
    }

    out.push({
      index: i,
      position: { x: px, y: py },
      rotation,
      scale: { x: baseScaleX, y: baseScaleY },
      opacity: baseOpacity,
      isSourceIndex: false,
    })
  }
  return out
}
