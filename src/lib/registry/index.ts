// Registry barrel — also exports the singleton instances used everywhere.
//
// IMPORTANT: importing this module triggers bootstrap (registry/bootstrap.ts),
// which populates the singletons. Code that needs a working registry MUST
// import from here, not directly from LayerRegistry.ts / LayerRendererRegistry.ts.

export { LayerRegistry } from './LayerRegistry'
export { LayerRendererRegistry } from './LayerRendererRegistry'
export type { LayerDefinition, LayerCategory } from './LayerDefinition'
export type { LayerRendererPlugin, LayerPaintCapability } from './LayerRendererRegistry'
export type { PropertySchema, PropertyGroup, PropValueType } from './PropertySchema'

// Singletons (declared in a separate module to avoid ESM hoisting TDZ bugs
// when bootstrap.ts tries to read them before they're initialised).
export { layerRegistry, rendererRegistry } from './singletons'

// Bootstrap is called once on first import. Imported AFTER singletons
// re-export so the module graph is settled before registration runs.
import './bootstrap'
