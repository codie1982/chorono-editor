// ── Registry Bootstrap ────────────────────────────────────────────────────────
//
// Populates the singleton registries on first import. Order matters — items
// appear in menus in registration order.

import { layerRegistry, rendererRegistry } from './singletons'
import { ALL_SHAPE_DEFINITIONS }  from './definitions/shapes'
import { textDefinition }         from './definitions/text/TextDefinition'
import { ALL_MEDIA_DEFINITIONS }  from './definitions/media/MediaDefinitions'
import { bezierPathDefinition }   from './definitions/path/BezierPathDefinition'
import { pathStrokeDefinition }   from './definitions/path/PathStrokeDefinition'
import { groupDefinition }        from './definitions/scene/GroupDefinition'
import { repeaterDefinition }     from './definitions/scene/RepeaterDefinition'
import { ALL_BUILT_IN_RENDERERS } from '@/lib/render/renderers'
// BL-13 — Particle Effect Engine
import { particleEmitterDefinition } from './definitions/particles/ParticleEmitterDefinition'
import '@/lib/particles/presets'   // registers all built-in presets as side-effect

// Guard against re-running (HMR / tests reloading the module)
let bootstrapped = false

export function bootstrapLayerRegistry(): void {
  if (bootstrapped) return
  bootstrapped = true

  // ── LayerDefinitions (factory + property schemas) ──
  //
  // Basic Shapes (11 kinds)
  for (const def of ALL_SHAPE_DEFINITIONS) layerRegistry.register(def)

  // Path & Vector
  layerRegistry.register(pathStrokeDefinition)
  layerRegistry.register(bezierPathDefinition)

  // Text
  layerRegistry.register(textDefinition)

  // Media (3 kinds)
  for (const def of ALL_MEDIA_DEFINITIONS) layerRegistry.register(def)

  // Groups & Scene Graph
  layerRegistry.register(groupDefinition)
  layerRegistry.register(repeaterDefinition)

  // Particles (BL-13)
  layerRegistry.register(particleEmitterDefinition)

  // ── LayerRendererPlugins (canvas dispatch) ──
  for (const plugin of ALL_BUILT_IN_RENDERERS) rendererRegistry.register(plugin)
}

bootstrapLayerRegistry()

export {}
