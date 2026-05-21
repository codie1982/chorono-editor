// ── Flat → ArraySettings builder ──────────────────────────────────────────────
// Shared by the AI tool (array_layer) and the script API (scene.array). Takes a
// flat parameter bag (easy for LLM JSON + JS callers) and produces a valid
// discriminated-union ArraySettings starting from the pattern's defaults.

import type { ArraySettings } from './ArrayTypes'
import {
  defaultLinearArraySettings, defaultGridArraySettings,
  defaultRadialArraySettings, defaultPathArraySettings,
} from './ArrayTypes'
import type { CloneMode } from '../clone/CloneTypes'

export interface FlatArrayParams {
  pattern: 'linear' | 'grid' | 'radial' | 'path'
  cloneMode?: CloneMode
  count?: number
  // linear
  moveX?: number; moveY?: number; rotationDeg?: number; scaleX?: number; scaleY?: number
  // grid
  columns?: number; rows?: number
  columnMoveX?: number; columnMoveY?: number; rowMoveX?: number; rowMoveY?: number
  // radial
  centerX?: number; centerY?: number; radius?: number
  startAngleDeg?: number; totalAngleDeg?: number; closed?: boolean; orientToAngle?: boolean
  // path
  pathLayerId?: string; startOffset?: number; endOffset?: number
  alignToTangent?: boolean; reverse?: boolean
}

export function buildArraySettings(p: FlatArrayParams): ArraySettings {
  let settings: ArraySettings

  if (p.pattern === 'linear') {
    const s = defaultLinearArraySettings()
    if (p.count != null) s.count = p.count
    if (p.moveX != null) s.move.x = p.moveX
    if (p.moveY != null) s.move.y = p.moveY
    if (p.rotationDeg != null) s.rotationDeg = p.rotationDeg
    if (p.scaleX != null) s.scale.x = p.scaleX
    if (p.scaleY != null) s.scale.y = p.scaleY
    settings = s
  } else if (p.pattern === 'grid') {
    const s = defaultGridArraySettings()
    if (p.columns != null) s.columns = p.columns
    if (p.rows != null) s.rows = p.rows
    if (p.columnMoveX != null) s.columnMove.x = p.columnMoveX
    if (p.columnMoveY != null) s.columnMove.y = p.columnMoveY
    if (p.rowMoveX != null) s.rowMove.x = p.rowMoveX
    if (p.rowMoveY != null) s.rowMove.y = p.rowMoveY
    settings = s
  } else if (p.pattern === 'radial') {
    const s = defaultRadialArraySettings()
    if (p.count != null) s.count = p.count
    if (p.centerX != null) s.center.x = p.centerX
    if (p.centerY != null) s.center.y = p.centerY
    if (p.radius != null) s.radius = p.radius
    if (p.startAngleDeg != null) s.startAngleDeg = p.startAngleDeg
    if (p.totalAngleDeg != null) s.totalAngleDeg = p.totalAngleDeg
    if (p.closed != null) s.closed = p.closed
    if (p.orientToAngle != null) s.orientToAngle = p.orientToAngle
    settings = s
  } else {
    const s = defaultPathArraySettings(p.pathLayerId ?? '')
    if (p.count != null) s.count = p.count
    if (p.startOffset != null) s.startOffset = p.startOffset
    if (p.endOffset != null) s.endOffset = p.endOffset
    if (p.alignToTangent != null) s.alignToTangent = p.alignToTangent
    if (p.reverse != null) s.reverse = p.reverse
    settings = s
  }

  if (p.cloneMode) settings.cloneMode = p.cloneMode
  return settings
}
