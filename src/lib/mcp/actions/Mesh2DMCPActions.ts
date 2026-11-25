import type { ActionDef, ActionRegistry } from '@/lib/ai/ActionRegistry'
import { makeAddLayerCmd, makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import {
  resetMesh2DTextureTransform,
  selectMesh2DPinPreset,
  setMesh2DDeformation,
  setMesh2DPins,
  setMesh2DTexture,
  setMesh2DTextureTransform,
} from '@/lib/mesh2d'
import {
  newShapeBoundaryMesh2DLayer,
  newSplineBoundaryMesh2DLayer,
  regenerateShapeBoundaryMesh2DLayer,
  regenerateSplineBoundaryMesh2DLayer,
} from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'
import type { ChronoScene, Layer } from '@/lib/types'
import type { Mesh2DTextureTransform } from '@/lib/types/mesh2d'

const layerId = {
  type: 'string',
  description: 'Existing Mesh2D layer id from get_scene; display names are not ids.',
}
const nullableAssetId = {
  anyOf: [{ type: 'string' }, { type: 'null' }],
  description: 'Existing asset id, or null to clear the current reference.',
}

/**
 * Registers the focused Mesh2D MCP authoring surface.
 *
 * These adapters reuse the same pure generators and immutable authoring
 * helpers as the inspector. Every operation returns a native editor command,
 * so revision authorization, attribution and one-step undo remain owned by the
 * shared MCP/editor boundary. No decoded image, GPU resource or deformation
 * sample is retained here.
 */
export function registerMesh2DMCPActions(registry: ActionRegistry): void {
  register(registry, {
    id: 'mcp.createMesh2DFromSource',
    toolName: 'create_mesh2d_from_source',
    description: 'Create an independent fixed-topology Mesh2D from one closed spline or supported parametric shape. The source layer remains editable and linked for explicit regeneration.',
    parameters: {
      type: 'object',
      properties: {
        sourceLayerId: { type: 'string', description: 'Closed spline or supported shape layer id from get_scene.' },
        flattenTolerance: { type: 'number', exclusiveMinimum: 0, maximum: 10, description: 'Curve flattening tolerance in source-layer local pixels; omit for the generator default.' },
      },
      required: ['sourceLayerId'],
    },
    toCommand: (params: { sourceLayerId: string; flattenTolerance?: number }, scene: ChronoScene) => {
      const source = requireLayer(scene, params.sourceLayerId)
      const options = { flattenTolerance: params.flattenTolerance }
      const mesh = source.type === 'spline'
        ? newSplineBoundaryMesh2DLayer(source, options)
        : newShapeBoundaryMesh2DLayer(source, options)
      return makeAddLayerCmd(mesh)
    },
  })

  register(registry, {
    id: 'mcp.regenerateMesh2D',
    toolName: 'regenerate_mesh2d',
    description: 'Regenerate shape- or spline-derived Mesh2D geometry from its stored source link while preserving styling, placement, texture settings, pins and deformation binding when compatible.',
    parameters: {
      type: 'object',
      properties: {
        layerId,
        flattenTolerance: { type: 'number', exclusiveMinimum: 0, maximum: 10, description: 'Curve flattening tolerance in source-layer local pixels; omit to reuse the stored tolerance.' },
      },
      required: ['layerId'],
    },
    toCommand: (params: { layerId: string; flattenTolerance?: number }, scene: ChronoScene) => {
      const layer = requireMesh2D(scene, params.layerId)
      const source = layer.mesh2d!.source
      if (source.kind === 'authored') throw new Error('Modeled Mesh2D owns its geometry. Use its modifier stack or the baked snapshot; it has no external regeneration source.')
      if (source.kind === 'structuredGrid') throw new Error('Structured-grid Mesh2D has no external source to regenerate')
      if (source.kind === 'fractureFragment') throw new Error('Fracture fragment Mesh2D is bake-owned; use Physics Re-bake instead')
      const sourceLayer = requireLayer(scene, source.sourceLayerId)
      const options = { flattenTolerance: params.flattenTolerance }
      const next = source.kind === 'splineBoundary'
        ? regenerateSplineBoundaryMesh2DLayer(layer, sourceLayer, options)
        : regenerateShapeBoundaryMesh2DLayer(layer, sourceLayer, options)
      return makeUpdateLayerCmd(layer.id, next, layer)
    },
  })

  register(registry, {
    id: 'mcp.setMesh2DTexture',
    toolName: 'set_mesh2d_texture',
    description: 'Set or clear a Mesh2D image/sprite-sheet texture and optionally update its portable fit, offset, scale, rotation, pivot and flip placement without changing UVs or topology.',
    parameters: {
      type: 'object',
      properties: {
        layerId,
        textureAssetId: nullableAssetId,
        sampling: { type: 'string', enum: ['linear', 'nearest'], description: 'Texture sampling mode; omit to preserve the current value.' },
        resetTransform: { type: 'boolean', description: 'When true, restore the implicit legacy stretch placement before applying transform.' },
        transform: textureTransformSchema(),
      },
      required: ['layerId', 'textureAssetId'],
    },
    toCommand: (params: {
      layerId: string
      textureAssetId: string | null
      sampling?: 'linear' | 'nearest'
      resetTransform?: boolean
      transform?: Partial<Omit<Mesh2DTextureTransform, 'schemaVersion'>>
    }, scene: ChronoScene) => {
      const layer = requireMesh2D(scene, params.layerId)
      if (params.textureAssetId) {
        const asset = scene.assets.find(candidate => candidate.id === params.textureAssetId)
        if (!asset || (asset.type !== 'image' && asset.type !== 'spriteSheet')) {
          throw new Error('Mesh2D texture asset must be an existing image or spriteSheet')
        }
      }
      let next = params.resetTransform ? resetMesh2DTextureTransform(layer) : layer
      next = setMesh2DTexture(next, params.textureAssetId, params.sampling)
      if (params.transform) next = setMesh2DTextureTransform(next, params.transform)
      return makeUpdateLayerCmd(layer.id, next, layer)
    },
  })

  register(registry, {
    id: 'mcp.setMesh2DPins',
    toolName: 'set_mesh2d_pins',
    description: 'Replace Mesh2D cloth/deformation pins with a deterministic preset, an explicit stable vertex-id list, or an empty selection. Pin ids are validated against the current topology.',
    parameters: {
      type: 'object',
      properties: {
        layerId,
        preset: { type: 'string', enum: ['topEdge', 'corners', 'boundary', 'clear'], description: 'Deterministic preset. Use either preset or vertexIds, not both.' },
        vertexIds: { type: 'array', items: { type: 'string' }, uniqueItems: true, description: 'Explicit stable topology vertex ids. Use either vertexIds or preset.' },
      },
      required: ['layerId'],
    },
    toCommand: (params: { layerId: string; preset?: 'topEdge' | 'corners' | 'boundary' | 'clear'; vertexIds?: string[] }, scene: ChronoScene) => {
      const layer = requireMesh2D(scene, params.layerId)
      if ((params.preset === undefined) === (params.vertexIds === undefined)) {
        throw new Error('Supply exactly one of preset or vertexIds')
      }
      const next = params.vertexIds
        ? setMesh2DPins(layer, params.vertexIds)
        : params.preset === 'clear'
          ? setMesh2DPins(layer, [])
          : selectMesh2DPinPreset(layer, params.preset!)
      return makeUpdateLayerCmd(layer.id, next, layer)
    },
  })

  register(registry, {
    id: 'mcp.setMesh2DDeformation',
    toolName: 'set_mesh2d_deformation',
    description: 'Set or clear one fixed-topology meshDeformation clip binding and its composition-time playback mapping. Dense samples remain in the referenced binary asset.',
    parameters: {
      type: 'object',
      properties: {
        layerId,
        assetId: nullableAssetId,
        startTimeMs: { type: 'number', minimum: 0, description: 'Composition time in milliseconds mapped to clip-local zero.' },
        playbackRate: { type: 'number', exclusiveMinimum: 0, maximum: 100, description: 'Positive clip playback multiplier.' },
        loop: { type: 'boolean', description: 'Whether the deformation clip loops after its duration.' },
      },
      required: ['layerId', 'assetId'],
    },
    toCommand: (params: { layerId: string; assetId: string | null; startTimeMs?: number; playbackRate?: number; loop?: boolean }, scene: ChronoScene) => {
      const layer = requireMesh2D(scene, params.layerId)
      if (params.assetId) {
        const asset = scene.assets.find(candidate => candidate.id === params.assetId)
        if (!asset || asset.type !== 'meshDeformation') throw new Error('Mesh2D deformation asset must be an existing meshDeformation asset')
      }
      const next = setMesh2DDeformation(layer, params.assetId, {
        startTimeMs: params.startTimeMs,
        playbackRate: params.playbackRate,
        loop: params.loop,
      })
      return makeUpdateLayerCmd(layer.id, next, layer)
    },
  })
}

/** Register a native action unless another bootstrap already owns its tool name. */
function register(registry: ActionRegistry, definition: ActionDef<any>): void {
  if (!registry.get(definition.toolName)) registry.register(definition)
}

/** Return an existing layer or fail without creating a partial command. */
function requireLayer(scene: ChronoScene, id: string): Layer {
  const layer = scene.layers.find(candidate => candidate.id === id)
  if (!layer) throw new Error(`Layer not found: ${id}`)
  return layer
}

/** Return an existing Mesh2D layer with its portable source payload. */
function requireMesh2D(scene: ChronoScene, id: string): Layer {
  const layer = requireLayer(scene, id)
  if (layer.type !== 'mesh2d' || !layer.mesh2d) throw new Error(`Mesh2D layer not found: ${id}`)
  return layer
}

/** Public partial texture-placement schema; omitted fields preserve their values. */
function textureTransformSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    description: 'Partial portable texture placement; omitted fields preserve their current resolved values.',
    properties: {
      fit: { type: 'string', enum: ['stretch', 'contain', 'cover', 'fitX', 'fitY', 'original'], description: 'Base mapping from texture pixels into Mesh2D local bounds.' },
      offsetX: { type: 'number', description: 'Horizontal placement offset in layer-local composition pixels.' },
      offsetY: { type: 'number', description: 'Vertical placement offset in layer-local composition pixels.' },
      scaleX: { type: 'number', exclusiveMinimum: 0, maximum: 100, description: 'Positive horizontal multiplier after fit.' },
      scaleY: { type: 'number', exclusiveMinimum: 0, maximum: 100, description: 'Positive vertical multiplier after fit.' },
      rotationDeg: { type: 'number', description: 'Clockwise texture rotation in degrees.' },
      pivotU: { type: 'number', minimum: 0, maximum: 1, description: 'Normalized horizontal texture pivot.' },
      pivotV: { type: 'number', minimum: 0, maximum: 1, description: 'Normalized vertical texture pivot.' },
      flipX: { type: 'boolean', description: 'Reflect the texture horizontally without using a negative scale.' },
      flipY: { type: 'boolean', description: 'Reflect the texture vertically without using a negative scale.' },
    },
  }
}
