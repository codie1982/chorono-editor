// ── ImageEncoders ─────────────────────────────────────────────────────────────
//
// BL-80 — thin adapters over the native Canvas `toBlob` API. Each browser
// codec (PNG / WEBP / JPEG) is exposed through one typed entry point so the
// RasterExportEngine never touches MIME strings directly.
//
// TIFF is intentionally NOT here: the platform `toBlob` codec list does not
// include it, so it needs a userland encoder (deferred — see BL-80 notes).

export type RasterFormat = 'png' | 'webp' | 'jpeg'

export const RASTER_MIME: Record<RasterFormat, string> = {
  png:  'image/png',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
}

export const RASTER_EXTENSION: Record<RasterFormat, string> = {
  png:  'png',
  webp: 'webp',
  jpeg: 'jpg',
}

/** Formats that carry an alpha channel — used to warn when a transparent
 *  background is requested for a format that cannot keep it (JPEG). */
export const RASTER_SUPPORTS_ALPHA: Record<RasterFormat, boolean> = {
  png:  true,
  webp: true,
  jpeg: false,
}

/**
 * Encode a canvas to a Blob in the given format.
 *
 * @param canvas  source canvas (already rendered at the target resolution)
 * @param format  png | webp | jpeg
 * @param quality 0–1 lossy quality (webp / jpeg only; ignored for png)
 */
export function encodeCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  format: RasterFormat,
  quality = 0.92,
): Promise<Blob> {
  const mime = RASTER_MIME[format]

  // OffscreenCanvas has a promise-based convertToBlob; HTMLCanvasElement uses
  // the callback-based toBlob. Support both so the engine can run off the main
  // thread later (worker) without code changes.
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: mime, quality })
  }

  return new Promise<Blob>((resolve, reject) => {
    ;(canvas as HTMLCanvasElement).toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error(`Canvas encode failed for format "${format}"`))
      },
      mime,
      quality,
    )
  })
}
