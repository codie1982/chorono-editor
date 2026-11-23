'use client'
import { useState } from 'react'
import type { Asset, Layer } from '@/lib/types'
import { splineObjectStyle, withSplineObjectPaint, splinePaintTargets } from '@/lib/spline/paint/objectPaint'
import { SplinePaintControls } from './SplinePaintControls'
import { NumericPropertyProvider } from '../inputs/expressions/NumericPropertyContext'

/** Properties-only paint target. Ordinary Objects retain shared paint; band
 * Objects may independently override it, without touching source appearance.
 * Independent paint is static source data; root animation/fx paths must not
 * accidentally bind to it. The host owns one native Undo per style change. */
export function SplineAppearanceControls({ layer, assets, onChange }: { layer: Layer; assets: readonly Asset[]; onChange(layer: Layer): void }) {
  const [target, setTarget] = useState(''), objects = splinePaintTargets(layer)
  const object = objects.find(o => o.id === target), style = object ? splineObjectStyle(object, layer.style, layer.splinePaintOverrides?.objects[object.id]) ?? {} : layer.style ?? {}
  const controls = <SplinePaintControls independent={!!object} style={style} assets={assets}
    closed={!!layer.spline && (object ? object.contourIds : Object.keys(layer.spline.contours)).every(id => layer.spline!.contours[id].closed)}
    onChange={next => onChange(object ? withSplineObjectPaint(layer, object.id, next) : { ...layer, style: next })} />
  return <section aria-label="Spline appearance">
    {!!objects.length && <label className="block py-2 text-xs">Paint target<select aria-label="Spline paint target" value={object?.id ?? ''} className="mt-1 w-full rounded border border-gray-600 bg-gray-800 p-2" onChange={event => setTarget(event.target.value)}>
      <option value="">Shared source paint</option>{objects.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select></label>}
    {object ? <NumericPropertyProvider>{controls}
      <button type="button" className="my-2 rounded border border-gray-600 px-2 py-1 text-xs" onClick={() => onChange(withSplineObjectPaint(layer, object.id, null))}>Use source stroke as fill</button>
    </NumericPropertyProvider> : controls}
  </section>
}
