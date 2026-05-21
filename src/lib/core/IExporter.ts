// ── IExporter ─────────────────────────────────────────────────────────────────
// Abstract export contract. Each mode provides its own exporter that converts
// the scene into a deliverable artifact.
//
// 2D Animation → GIF / WebM / Standalone HTML
// Video Editor → MP4 / WebM
// Game Engine  → Standalone HTML + runtime JSON
// 3D Modeling  → GLTF / OBJ

import type { EditorMode } from './EditorMode'
import type { IScene } from './IScene'

export interface ExportOptions {
  /** Target output quality / resolution multiplier (default 1). */
  scale?: number
  /** Frame range to export. undefined = full scene duration. */
  startMs?: number
  endMs?: number
}

export interface ExportResult {
  /** Binary or text content. */
  data: Blob | string
  mimeType: string
  /** Suggested file name including extension, e.g. "animation.gif". */
  filename: string
}

export interface IExporter {
  mode: EditorMode
  /** Human-readable format label shown in the export dialog, e.g. "GIF". */
  label: string

  /**
   * Convert the scene into an exportable artifact.
   * Implementations may be async (frame rendering, encoding, file generation).
   */
  export(scene: IScene, options?: ExportOptions): Promise<ExportResult>
}
