// ── Runtime export types ─────────────────────────────────────────────────────
//
// Minimal JSON format consumed by the standalone runtime (Android/iOS/Web
// players). Stripped of editor-only fields (locked, hidden, colorLabel, etc.)
// and with paths compressed to short strings.

import type { Layer, Timeline, Composition, SceneParameter, Trigger, Binding } from './core'

export interface RuntimeAnimation {
  formatVersion: '1.0.0'
  composition:   Composition
  layers:        Layer[]      // editor-meta-stripped
  timelines:     Timeline[]
  parameters:    SceneParameter[]
  triggers:      Trigger[]
  bindings:      Binding[]
}

export interface RuntimePackage {
  version:   '1.0'
  runtime:   RuntimeAnimation
  warnings:  RuntimeWarning[]
}

export type RuntimeWarningCode =
  | 'REQUIRES_LIVE_EXPRESSIONS'
  | 'INVALID_EXPRESSION'
  | 'UNSUPPORTED_EFFECT'
  | 'MISSING_ASSET'
  | 'INVALID_PATH'
  | 'EXCESSIVE_LAYERS'
  | 'CYCLIC_REFERENCE'

export interface RuntimeWarning {
  code:    RuntimeWarningCode
  message: string
  layerId?: string
}

export type RuntimeErrorCode = RuntimeWarningCode | 'EMPTY_SCENE' | 'INVALID_COMPOSITION'

export interface RuntimeError {
  code:    RuntimeErrorCode
  message: string
  layerId?: string
}

export interface RuntimeValidationResult {
  errors:   RuntimeError[]
  warnings: RuntimeWarning[]
}
