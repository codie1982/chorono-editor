import type { ChronoScene, Layer } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { layerBooleanOperand } from '@/lib/geometry/boolean/layerOperand'
import { pathToSvgString } from '@/lib/geometry'
import { splineToPathDefinition } from '@/lib/spline'

/** Read-only presentation of one retained Boolean recipe during source Edit.
 * The host supplies its canonical projected result, never the empty persisted
 * result placeholder. Source contours use their own complete evaluated affine;
 * the result uses its own affine. Stroke widths/dashes stay in CSS pixels.
 * This component neither solves geometry nor changes source/history/exports. */
export function BooleanEditOverlay({ scene, owner, result, timeMs, overrides, zoom }: {
  scene: ChronoScene; owner: Layer; result: Layer | undefined; timeMs: number; overrides: OverrideMap; zoom: number
}) {
  const recipe = owner.booleanOperation
  if (!recipe || !result?.spline) return null
  const transform = (layer: Layer) => `matrix(${resolveLayerWorldMatrix(layer, scene, timeMs, overrides).toArray().map(value => value * zoom).join(' ')})`
  return <>
    <svg role="img" aria-label="Boolean sources and result" className="absolute inset-0 z-30 overflow-visible pointer-events-none">
      <g aria-label="Boolean source ghosts" fill="none" stroke="#94a3b8" strokeOpacity={.28} strokeWidth={1.25} strokeDasharray="5 4">
        {recipe.inputs.map(input => {
          const source = scene.layers.find(layer => layer.id === input.layerId)
          if (!source) return null
          const path = layerBooleanOperand(source, input.subShapeId).path
          return <path key={`${input.layerId}:${input.subShapeId ?? ''}`} data-boolean-source-ghost
            d={pathToSvgString(path)} transform={transform(source)} vectorEffect="non-scaling-stroke" />
        })}
      </g>
      <g aria-label="Boolean result boundary" transform={transform(result)} fill="none" strokeLinejoin="round">
        <path d={pathToSvgString(splineToPathDefinition(result.spline))} stroke="#ffffff" strokeOpacity={.8} strokeWidth={5} vectorEffect="non-scaling-stroke" />
        <path data-boolean-result-boundary d={pathToSvgString(splineToPathDefinition(result.spline))}
          stroke="#f97316" strokeWidth={2.75} vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
    <div role="note" aria-label="Boolean edit legend" className="absolute bottom-3 left-3 z-40 rounded border border-orange-400/40 bg-gray-950/90 px-2 py-1 text-xs text-orange-100 pointer-events-none">
      Dashed: source ghosts · Orange: {recipe.operation === 'xor' ? 'XOR' : recipe.operation[0].toUpperCase() + recipe.operation.slice(1)} result
    </div>
  </>
}
