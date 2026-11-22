'use client'
import { useRef } from 'react'
import type { Asset, ImagePaint } from '@/lib/types'
import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'

export const paintSelectClass = 'w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus-visible:outline focus-visible:outline-blue-400'

/** Static asset selector and local image placement, shared by shape/background.
 * Source ownership/import/history stay with the host. Numeric units are local px,
 * degrees and UI percent (stored uniform scale factor). No decode or frame loop.
 * Pending/missing assets remain visible by ID instead of silently substituting.
 */
export function ImagePaintControls({ value, assets, onChange, onImport }: {
  value: ImagePaint; assets: readonly Asset[]; onChange(value: ImagePaint): void; onImport?: (file: File) => void
}) {
  const picker = useRef<HTMLInputElement>(null)
  const images = assets.filter(asset => asset.type === 'image')
  const update = (patch: Partial<ImagePaint>) => onChange({ ...value, ...patch })
  return <div className="space-y-2 rounded border border-gray-700 p-2">
    <label className="block space-y-1 text-xs text-gray-400"><span>Image asset</span><select aria-label="Image asset" value={value.assetId} onChange={event => update({ assetId: event.target.value })} className={paintSelectClass}>
      <option value="">Choose an image…</option>
      {value.assetId && !images.some(asset => asset.id === value.assetId) && <option value={value.assetId}>Missing image · {value.assetId}</option>}
      {images.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
    </select></label>
    {onImport ? <><input ref={picker} type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="hidden" aria-label="Import paint image file" onChange={event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (file) onImport(file)
    }} /><button type="button" onClick={() => picker.current?.click()} className="rounded border border-gray-600 px-2 py-1.5 text-xs hover:bg-gray-700">Import image…</button></>
      : !images.length && <p className="text-xs text-gray-400">Import an image in Assets, then choose it here.</p>}
    <label className="block space-y-1 text-xs text-gray-400"><span>Fit</span><select aria-label="Image fit" value={value.fit ?? 'cover'} onChange={event => update({ fit: event.target.value as ImagePaint['fit'] })} className={paintSelectClass}>
      <option value="cover">Cover</option><option value="contain">Contain</option><option value="fill">Stretch</option>
    </select></label>
    <div className="grid grid-cols-2 gap-2">
      <PaintNumber label="Image offset X" unit="px" value={value.offsetX ?? 0} onChange={offsetX => update({ offsetX })} />
      <PaintNumber label="Image offset Y" unit="px" value={value.offsetY ?? 0} onChange={offsetY => update({ offsetY })} />
      <PaintNumber label="Image scale" unit="%" min={1} max={10000} value={(value.scale ?? 1) * 100} onChange={percent => update({ scale: percent / 100 })} />
      <PaintNumber label="Image rotation" unit="°" value={value.rotationDeg ?? 0} onChange={rotationDeg => update({ rotationDeg })} />
    </div>
    <button type="button" className="rounded border border-gray-600 px-2 py-1.5 text-xs hover:bg-gray-700" onClick={() => update({ offsetX: 0, offsetY: 0, scale: 1, rotationDeg: 0 })}>Reset image placement</button>
  </div>
}
/** Config values are finite; invalid typing never enters source or Undo. */
export function PaintNumber({ label, unit, value, onChange, min, max }: { label: string; unit: string; value: number; onChange(value: number): void; min?: number; max?: number }) {
  const commit = (n: number) => { if (Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) onChange(n) }
  return <label className="flex min-w-0 flex-col gap-1 text-xs text-gray-400"><span>{label.replace('Image ', '')} ({unit})</span>
    <CalculationNumberInput aria-label={label} value={value} min={min} max={max} step="any" onCalculate={commit}
      onChange={event => { if (event.target.value !== '') commit(+event.target.value) }} className="min-w-0 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-gray-100" /></label>
}
