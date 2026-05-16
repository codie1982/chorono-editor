// ── Registry Singletons ───────────────────────────────────────────────────────
//
// Singletons live in their own module so bootstrap.ts can import them WITHOUT
// triggering a circular initialisation race. (If singletons were declared in
// index.ts alongside `import './bootstrap'`, ESM hoisting would run bootstrap
// before the singletons were assigned — TDZ ReferenceError.)

import { LayerRegistry } from './LayerRegistry'
import { LayerRendererRegistry } from './LayerRendererRegistry'

export const layerRegistry    = new LayerRegistry()
export const rendererRegistry = new LayerRendererRegistry()
