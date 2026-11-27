'use client'
import { useEffect, useState } from 'react'
import type { ModifierGeometry } from '@/lib/modifiers'
import type { ShapeParams } from '@/lib/types'

/** Explicit source rebuild; converted point overrides clear only on this
 * user-requested action. No typing changes an object before Execute. */
export function ModifierSourceSettings({ source, disabled, onExecute }: {
  source: ModifierGeometry; disabled?: boolean; onExecute(source: ModifierGeometry): void
}) {
  const shape = source.kind === 'shape' && source.sources.length === 1 && source.sources[0].type === 'shape' ? source.sources[0] : undefined
  const [width, setWidth] = useState(shape?.size?.width ?? 100)
  const [height, setHeight] = useState(shape?.size?.height ?? 100)
  const [radius, setRadius] = useState(shape?.cornerRadius ?? 0)
  const [params, setParams] = useState<ShapeParams | undefined>(shape?.shapeParams)
  useEffect(() => {
    setWidth(shape?.size?.width ?? 100); setHeight(shape?.size?.height ?? 100)
    setRadius(shape?.cornerRadius ?? 0); setParams(shape?.shapeParams)
  }, [source, shape])
  return <div className="space-y-3">
    {shape ? <div className="grid grid-cols-2 gap-2">
      {([{ label: 'Width', value: width, set: setWidth }, { label: 'Height', value: height, set: setHeight }] as const).map(field => <label key={field.label}>{field.label} (px)
        <input className="mt-1 min-h-8 w-full rounded border border-gray-600 bg-gray-800 px-2" aria-label={`Modifier source ${field.label}`} type="number" min="0.01" value={Number.isFinite(field.value) ? field.value : ''} onChange={e => field.set(e.currentTarget.valueAsNumber)} disabled={disabled} />
      </label>)}
      {(shape.shapeKind ?? shape.shape ?? 'rect') === 'rect' && <label>Corner radius<input aria-label="Modifier source Corner radius" type="number" min="0" value={Number.isFinite(radius) ? radius : ''}
        onChange={e => setRadius(e.currentTarget.valueAsNumber)} className="mt-1 min-h-8 w-full rounded border border-gray-600 bg-gray-800 px-2" disabled={disabled} /></label>}
      {Object.entries(params ?? {}).flatMap(([key, value]) => typeof value === 'number' ? [<label key={key}>{key}<input aria-label={`Modifier source ${key}`} type="number" value={Number.isFinite(value) ? value : ''}
        onChange={e => { const number = e.currentTarget.valueAsNumber; setParams(previous => previous ? { ...previous, [key]: number } : previous) }} className="mt-1 min-h-8 w-full rounded border border-gray-600 bg-gray-800 px-2" disabled={disabled} /></label>] : [])}
    </div> : <p className="text-gray-400">{source.kind === 'shape' ? `${source.sources.length} original objects · Union` : source.kind === 'spline' ? `${Object.keys(source.spline.points).length} source points` : `${source.mesh.geometry.positions.length / 2} source vertices`}.</p>}
    <p className="text-gray-400">Rebuild starts from the original geometry and replaces converted point edits.</p>
    <button type="button" disabled={disabled} className="min-h-8 rounded border border-gray-600 bg-gray-800 px-3 py-1.5 disabled:opacity-40" onClick={() => onExecute(shape && source.kind === 'shape'
      ? { ...source, sources: [{ ...shape, size: { width, height }, cornerRadius: radius, shapeParams: params }] } : source)}>Rebuild from source</button>
  </div>
}
