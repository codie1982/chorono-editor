import { BoundedTextReader } from '../resources/io'
import { GifImportService } from './gif'
import { editorMediaPreparation } from '../resources/jobs'
import { editorResourceBudget } from '../resources/budget'
import { LottieMetadataReader } from './handlers/document/lottie/LottieMetadataReader'
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
import { GifHandler }               from './handlers/asset/GifHandler'
import { SpriteSheetHandler }       from './handlers/asset/SpriteSheetHandler'
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
  importManager.registerHandler(new GifHandler(new GifImportService({ budget: editorResourceBudget, executor: editorMediaPreparation })))   // before ImageHandler — claims image/gif
  importManager.registerHandler(new ImageHandler())
  importManager.registerHandler(new SpriteSheetHandler())  // explicit format only (image/spritesheet)
  importManager.registerHandler(new VideoHandler())
  importManager.registerHandler(new AudioHandler())
  importManager.registerHandler(new FontHandler())

  // ── Document handlers ───────────────────────────────────────────────────────
  importManager.registerHandler(new SvgDocumentHandler(new BoundedTextReader({ budget: editorResourceBudget, maxInputBytes: 16 * 1024 ** 2 })))
  importManager.registerHandler(new LottieDocumentHandler(new LottieMetadataReader({ budget: editorResourceBudget })))
  importManager.registerHandler(new ChoronoSceneHandler(new BoundedTextReader({ budget: editorResourceBudget })))
}

/**
 * Re-export the singleton so callers can access it after init.
 * Prefer importing importManager directly from './ImportManager'.
 */
export { importManager }
