'use client'

import { useEffect, useState } from 'react'
import type { Layer } from '@/lib/types'
import type { GeometryConversionData } from '@/lib/types/geometryConversion'
import { makeGeometryConversionStackCmd } from '@/lib/editor/commands-geometry-conversion'
import type { GeometryEditPanelProps } from './GeometryEditPanel'
import { ModifierActionIcon } from './ModifierActionIcon'

const button = 'min-h-8 rounded border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-left hover:bg-gray-700 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400'
interface Props extends GeometryEditPanelProps { layer: Layer; selectedIds?: readonly string[] }

/** Persistent geometry-stage controls. UI drafts never mutate source; Convert,
 * tolerance changes, source rebuild and tail removal each dispatch one native
 * undo command. Errors stay visible beside the initiating control. */
export default function ConversionStackPanel(props: Props) {
  const { layer } = props
  const recipe = layer.geometryConversion
  const [selected, setSelected] = useState(recipe?.stages.at(-1)?.id ?? 'source')
  const [error, setError] = useState('')
  const [tolerance, setTolerance] = useState(recipe?.stages.find(stage => stage.kind === 'convertMesh2d')?.tolerancePx ?? .25)
  const source = recipe?.sources.length === 1 && recipe.sources[0].type === 'shape' ? recipe.sources[0] : undefined
  const [width, setWidth] = useState(source?.size?.width ?? layer.size?.width ?? 100)
  const [height, setHeight] = useState(source?.size?.height ?? layer.size?.height ?? 100)
  const [radius, setRadius] = useState(source?.cornerRadius ?? 0)
  const [sourceParams, setSourceParams] = useState(source?.shapeParams)
  // Undo/Redo and document changes replace the immutable recipe. Keep drafts
  // aligned with that committed snapshot without resetting in-progress typing.
  useEffect(() => {
    setWidth(source?.size?.width ?? layer.size?.width ?? 100)
    setHeight(source?.size?.height ?? layer.size?.height ?? 100)
    setRadius(source?.cornerRadius ?? 0); setSourceParams(source?.shapeParams)
    const mesh = recipe?.stages.find(stage => stage.kind === 'convertMesh2d')
    setTolerance(mesh?.kind === 'convertMesh2d' ? mesh.tolerancePx : .25)
    setSelected(previous => previous === 'source' || recipe?.stages.some(stage => stage.id === previous)
      ? previous : recipe?.stages.at(-1)?.id ?? 'source')
  }, [recipe])
  const multi = (props.selectedIds?.length ?? 1) > 1
  const run = (action: () => void) => {
    try {
      if (props.conversionDisabled || props.isTransactionActive() || props.getDocumentSignal().aborted) throw new Error('Finish playback or the current edit before converting.')
      action(); setError(''); props.onClearPoint(); return true
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return false }
  }
  const changeStack = (next: GeometryConversionData) => run(() => {
    props.dispatchCommand(makeGeometryConversionStackCmd(props.getScene(), layer.id, next))
  })
  const selectedStage = recipe?.stages.find(stage => stage.id === selected)
  return <details aria-label="Conversion history" className="space-y-2 border-t border-gray-700 pt-3">
    <summary className="cursor-pointer font-semibold">Conversion history{recipe ? ` · ${recipe.stages.length} ${recipe.stages.length === 1 ? 'step' : 'steps'}` : ''}</summary>
    {recipe && !multi && <>
      <p className="text-gray-400">Original geometry and the steps used to make this object editable.</p>
      <div className="grid gap-1" role="group" aria-label="Conversion steps">
        <button className={button} aria-pressed={selected === 'source'} onClick={() => setSelected('source')}>
          {recipe.sources.length > 1 ? `Original objects · Union (${recipe.sources.length})` : `Original ${recipe.sources[0].type === 'shape' ? 'Basic Shape' : 'Spline'}`}
        </button>
        {recipe.stages.map((stage, index) => <div key={stage.id} className={`flex items-center gap-1 rounded border ${selected === stage.id ? 'border-orange-400/70 bg-orange-500/10' : 'border-gray-700 bg-gray-800'}`}>
          <button className="min-h-9 min-w-0 flex-1 px-2.5 py-1.5 text-left focus-visible:outline focus-visible:outline-orange-300"
            aria-pressed={selected === stage.id} onClick={() => setSelected(stage.id)}>
            {stage.kind === 'convertSpline' ? 'Editable Spline' : '2D Mesh output'}
          </button>
          {stage.kind === 'convertMesh2d' && <button type="button" aria-label="Apply mesh settings" title="Apply Mesh settings"
            className="flex min-h-9 min-w-9 items-center justify-center rounded text-orange-200 hover:bg-gray-700 focus-visible:outline focus-visible:outline-orange-300 disabled:opacity-30"
            disabled={props.conversionDisabled || !Number.isFinite(tolerance) || tolerance < .01 || tolerance > 10 || tolerance === stage.tolerancePx}
            onClick={() => changeStack({ ...recipe, stages: recipe.stages.map(item => item.id === stage.id && item.kind === 'convertMesh2d' ? { ...item, tolerancePx: tolerance } : item) })}>
            <ModifierActionIcon action="apply" />
          </button>}
          <button type="button" aria-label={`Remove ${stage.kind === 'convertSpline' ? 'Spline' : '2D Mesh'} modifier`}
            title={index !== recipe.stages.length - 1 ? 'Remove the following 2D Mesh modifier first' : `Remove ${stage.kind === 'convertSpline' ? 'Spline' : '2D Mesh'} modifier`}
            className="flex min-h-9 min-w-9 items-center justify-center rounded text-gray-300 hover:bg-red-950 hover:text-red-200 focus-visible:outline focus-visible:outline-orange-300 disabled:opacity-30"
            disabled={props.conversionDisabled || index !== recipe.stages.length - 1}
            onClick={() => { const stages = recipe.stages.slice(0, index); if (changeStack({ ...recipe, stages })) setSelected(stages.at(-1)?.id ?? 'source') }}>
            <ModifierActionIcon action="remove" />
          </button>
        </div>)}
      </div>
      {selected === 'source' && <div className="space-y-2">
        <p className="text-gray-400">Original geometry is retained. Rebuild replaces point edits with the source boundary.</p>
        {source && <div className="grid grid-cols-2 gap-2">
          <label>Source width<input aria-label="Conversion source width" type="number" min="0.01" value={width} onChange={e => setWidth(e.currentTarget.valueAsNumber)} className="w-full bg-gray-800 p-1" /></label>
          <label>Source height<input aria-label="Conversion source height" type="number" min="0.01" value={height} onChange={e => setHeight(e.currentTarget.valueAsNumber)} className="w-full bg-gray-800 p-1" /></label>
          {(source.shapeKind ?? source.shape ?? 'rect') === 'rect' && <label>Corner radius<input aria-label="Conversion source corner radius" type="number" min="0" value={radius} onChange={e => setRadius(e.currentTarget.valueAsNumber)} className="w-full bg-gray-800 p-1" /></label>}
          {Object.entries(sourceParams ?? {}).flatMap(([key, value]) => typeof value === 'number' ? [
            <label key={key}>{key}<input aria-label={`Conversion source ${key}`} type="number" value={value}
              onChange={e => { const number = e.currentTarget.valueAsNumber; setSourceParams(params => params ? { ...params, [key]: number } : params) }} className="w-full bg-gray-800 p-1" /></label>,
          ] : [])}
        </div>}
        <button className={button} onClick={() => changeStack({ ...recipe,
          sources: source ? [{ ...source, size: { width, height }, cornerRadius: radius, shapeParams: sourceParams }] : recipe.sources,
          stages: recipe.stages.map(stage => stage.kind === 'convertSpline' ? { ...stage, edited: undefined } : stage),
        })}>Rebuild from source</button>
      </div>}
      {selectedStage?.kind === 'convertSpline' && (layer.type === 'mesh2d' ? <div className="space-y-2">
        <p className="text-gray-400">Return to the Spline input to edit its points. Reapply Convert 2D Mesh after editing.</p>
        <button className={button} onClick={() => changeStack({ ...recipe, stages: recipe.stages.slice(0, 1) })}>Edit Spline input</button>
      </div> : <p className="text-gray-400">Use Point, Edge or Object above to edit this Spline.</p>)}
      {selectedStage?.kind === 'convertMesh2d' && <div className="space-y-2">
        <label className="block">Curve tolerance (local px)<input aria-label="Conversion mesh tolerance" type="number" min="0.01" max="10" step="0.05" value={Number.isFinite(tolerance) ? tolerance : ''} onChange={e => setTolerance(e.currentTarget.valueAsNumber)} className="ml-2 w-20 bg-gray-800 p-1" /></label>
        <p className="text-gray-400">Smaller tolerance follows curves more closely. Holes stay open.</p>
      </div>}
    </>}
    {error && <p role="alert" className="text-amber-300">{error}</p>}
  </details>
}
