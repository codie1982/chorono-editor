// ── Convert commands (BL-17 Faz 1) ────────────────────────────────────────
// Editable conversions between layer types. Today only Shape → Spline,
// since that unlocks the entire sub-object / modifier-stack pipeline:
// once a primitive becomes a BezierPath, every Pen Tool feature and
// every Modifier (Bend, Boolean, Fractal, …) can operate on it.
//
// Round-trip safety: every preserved field is copied by reference where
// immutable (style / effects / motionPath) so undo restores the original
// object identity. Type-specific shape fields (shape, shapeKind,
// shapeParams) are stripped on the path layer — undo puts them back.

import type { ChronoScene, Layer, ShapeKind } from '../types'
import type { BezierPath, PathAnchor } from '../types/path'
import type { EditorCommand } from './commands-keyframe'
import { ShapeToPathConverter } from '../geometry/ShapeToPathConverter'
import type { NormalizedPathCommand, PathDefinition } from '../geometry/PathCommand'

// ── PathDefinition → BezierPath ──────────────────────────────────────────
// The renderer's normalized M/L/C/Z stream isn't directly editable — we
// need anchor records with in/out handles for the Pen Tool. This walker
// rebuilds anchors as it goes, attaching cubic tangents when present.

function pathDefinitionToBezier(def: PathDefinition): BezierPath {
  const anchors: PathAnchor[] = []
  let closed = false
  // TypeScript can't track that `push` mutates `pending` via closure when it
  // runs inside a switch arm — so we work with explicit reads/writes.
  let pending: PathAnchor | undefined

  const flush = (next: PathAnchor): void => {
    if (pending) anchors.push(pending)
    pending = next
  }

  for (const cmd of def.commands as NormalizedPathCommand[]) {
    switch (cmd.type) {
      case 'M':
        flush({ x: cmd.x, y: cmd.y, pointType: 'corner' })
        break
      case 'L':
        flush({ x: cmd.x, y: cmd.y, pointType: 'corner' })
        break
      case 'C': {
        // cmd.x1/y1 = outHandle of previous anchor; cmd.x2/y2 = inHandle of new
        const prev = pending
        if (prev) {
          prev.outX = cmd.x1
          prev.outY = cmd.y1
          prev.pointType = 'smooth'
        }
        flush({
          x: cmd.x, y: cmd.y,
          inX: cmd.x2, inY: cmd.y2,
          pointType: 'smooth',
        })
        break
      }
      case 'Q': {
        // Promote quadratic to cubic: cp1 = p0 + 2/3 (cp - p0); cp2 = p1 + 2/3 (cp - p1)
        const prev = pending
        const p0 = prev ?? { x: cmd.x, y: cmd.y }
        const cp1x = p0.x + (2 / 3) * (cmd.x1 - p0.x)
        const cp1y = p0.y + (2 / 3) * (cmd.y1 - p0.y)
        const cp2x = cmd.x + (2 / 3) * (cmd.x1 - cmd.x)
        const cp2y = cmd.y + (2 / 3) * (cmd.y1 - cmd.y)
        if (prev) {
          prev.outX = cp1x
          prev.outY = cp1y
          prev.pointType = 'smooth'
        }
        flush({
          x: cmd.x, y: cmd.y,
          inX: cp2x, inY: cp2y,
          pointType: 'smooth',
        })
        break
      }
      case 'Z':
        closed = true
        break
    }
  }
  if (pending) anchors.push(pending)
  return { anchors, closed }
}

// ── makeConvertToSplineCmd ───────────────────────────────────────────────

export function makeConvertToSplineCmd(layer: Layer): EditorCommand {
  if (layer.type !== 'shape' || !layer.size) {
    throw new Error('Convert to Spline only works on shape layers with a size')
  }

  // Read the shape kind from either the legacy field or the new one. Either
  // can be present depending on which factory created the layer.
  const kind: ShapeKind | 'rect' | 'circle' =
    layer.shapeKind ?? (layer.shape ?? 'rect')

  const def = ShapeToPathConverter.convert(
    kind,
    layer.size,
    layer.shapeParams,
    layer.style?.cornerRadius ?? 0,
  )

  const path = pathDefinitionToBezier(def)

  // Build the replacement layer — everything preserved except the type
  // discriminator and shape-only fields. Cornerradius is now baked into the
  // path geometry, so it's stripped from the style too (otherwise the
  // renderer would try to apply it again).
  const { shape: _shape, shapeKind: _kind, shapeParams: _params, ...rest } = layer
  void _shape; void _kind; void _params
  const newLayer: Layer = {
    ...rest,
    type: 'path',
    path,
    style: layer.style ? { ...layer.style, cornerRadius: undefined } : undefined,
  }

  return {
    label: `Convert ${layer.name} to Spline`,
    execute: (scene: ChronoScene) => ({
      ...scene,
      layers: scene.layers.map((l) => l.id === layer.id ? newLayer : l),
    }),
    undo: (scene: ChronoScene) => ({
      ...scene,
      layers: scene.layers.map((l) => l.id === layer.id ? layer : l),
    }),
  }
}
