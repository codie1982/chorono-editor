// ── initImportPipeline ────────────────────────────────────────────────────────
//
// Registers all built-in import handlers into the ImportManager singleton.
// Call this ONCE at application startup (e.g. in layout.tsx or page.tsx).
//
// Handlers are registered in priority order — first match wins.
// Asset handlers (simple) registered to AssetImporter.
// Document handlers (complex) registered to DocumentImporter.
//
// Usage:
//   import { initImportPipeline } from '@/lib/import/initImportPipeline'
//   initImportPipeline()  // call once, usually in the top-level component

import { importManager }           from './ImportManager'

// Asset handlers
import { ImageHandler }             from './handlers/asset/ImageHandler'
import { VideoHandler }             from './handlers/asset/VideoHandler'
import { AudioHandler }             from './handlers/asset/AudioHandler'
import { FontHandler }              from './handlers/asset/FontHandler'

// Document handlers
import { SvgDocumentHandler }       from './handlers/document/SvgDocumentHandler'
import { LottieDocumentHandler }    from './handlers/document/LottieDocumentHandler'
import { ChoronoSceneHandler }      from './handlers/document/ChoronoSceneHandler'

let _initialized = false

/**
 * Register all built-in import handlers into the ImportManager singleton.
 * Safe to call multiple times — only runs once.
 */
export function initImportPipeline(): void {
  if (_initialized) return
  _initialized = true

  // ── Asset handlers ──────────────────────────────────────────────────────────
  importManager.registerHandler(new ImageHandler())
  importManager.registerHandler(new VideoHandler())
  importManager.registerHandler(new AudioHandler())
  importManager.registerHandler(new FontHandler())

  // ── Document handlers ───────────────────────────────────────────────────────
  importManager.registerHandler(new SvgDocumentHandler())
  importManager.registerHandler(new LottieDocumentHandler())
  importManager.registerHandler(new ChoronoSceneHandler())
}

/**
 * Re-export the singleton so callers can access it after init.
 * Prefer importing importManager directly from './ImportManager'.
 */
export { importManager }
