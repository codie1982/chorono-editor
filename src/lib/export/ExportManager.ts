// ── ExportManager ─────────────────────────────────────────────────────────────
// Dispatches export requests to the correct IExporter for the active mode.
// FileMenu calls ExportManager.export() — it doesn't need to know which mode
// is active or which encoder to use.

import type { IExporter, ExportOptions, ExportResult } from '@/lib/core/IExporter'
import type { IScene } from '@/lib/core/IScene'
import type { EditorMode } from '@/lib/core/EditorMode'
import { modeRegistry } from '@/lib/modes/ModeRegistry'

export class ExportManager {
  /**
   * Export the given scene using the exporter that matches `exporterLabel`
   * within the active mode's exporter list.
   *
   * Throws if no matching exporter is registered.
   */
  static async export(
    scene: IScene,
    mode: EditorMode,
    exporterLabel: string,
    options?: ExportOptions,
  ): Promise<ExportResult> {
    const descriptor = modeRegistry.get(mode)
    const exporters = descriptor.createExporters()
    const exporter = exporters.find((e: IExporter) => e.label === exporterLabel)

    if (!exporter) {
      const available = exporters.map((e: IExporter) => e.label).join(', ')
      throw new Error(
        `[ExportManager] No exporter '${exporterLabel}' for mode '${mode}'. ` +
        `Available: ${available || 'none registered yet'}`,
      )
    }

    return exporter.export(scene, options)
  }

  /** List all exporter labels available for a mode. */
  static listExporters(mode: EditorMode): string[] {
    const descriptor = modeRegistry.get(mode)
    return descriptor.createExporters().map((e: IExporter) => e.label)
  }

  /**
   * Trigger a browser download for an ExportResult.
   * Works for both Blob and string data.
   */
  static download(result: ExportResult): void {
    const url =
      result.data instanceof Blob
        ? URL.createObjectURL(result.data)
        : `data:${result.mimeType};charset=utf-8,${encodeURIComponent(result.data as string)}`

    const a = document.createElement('a')
    a.href = url
    a.download = result.filename
    a.click()

    if (result.data instanceof Blob) URL.revokeObjectURL(url)
  }
}
