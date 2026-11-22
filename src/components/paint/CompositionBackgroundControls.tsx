'use client'
import type { Asset, Composition, ShapeFill } from '@/lib/types'
import { compositionFill, withFillType } from '@/lib/paint/paintSource'
import ColorInput from '@/components/inputs/ColorInput'
import GradientInput from '@/components/inputs/GradientInput'
import { ImagePaintControls, paintSelectClass } from './ImagePaintControls'

/** One source editor for the modal's draft and the composition inspector.
 * Export inclusion is explicit saved source; UI does not render/decode/import.
 * Legacy background fields stay available for old projects/metadata consumers. */
export function CompositionBackgroundControls({ composition, assets = [], onChange, onImport }: {
  composition: Composition; assets?: readonly Asset[]; onChange(value: Composition): void; onImport?: (file: File) => void
}) {
  const fill = compositionFill(composition)
  const change = (backgroundFill: ShapeFill) => onChange({ ...composition, backgroundFill,
    ...(backgroundFill.type === 'solid' && backgroundFill.color ? { backgroundColor: backgroundFill.color } : {}),
    ...(backgroundFill.type === 'gradient' ? { backgroundGradient: backgroundFill.gradient } : {}) })
  return <div className="space-y-3">
    <label className="block space-y-1 text-xs text-gray-400"><span>Background type</span><select aria-label="Background type" className={paintSelectClass} value={fill.type}
      onChange={event => change(withFillType(fill, event.target.value as ShapeFill['type']))}>
      <option value="none">None</option><option value="solid">Color</option><option value="gradient">Gradient</option><option value="image">Image</option>
    </select></label>
    {fill.type === 'solid' && <ColorInput value={fill.color ?? composition.backgroundColor} fieldLabel="Background color" onChange={color => change({ ...fill, color })} />}
    {fill.type === 'gradient' && <GradientInput value={fill.gradient} onChange={gradient => change({ ...fill, gradient })} />}
    {fill.type === 'image' && fill.image && <ImagePaintControls value={fill.image} assets={assets} onImport={onImport} onChange={image => change({ ...fill, image })} />}
    <label className="flex min-h-8 items-center gap-2 text-xs text-gray-300"><input type="checkbox" aria-label="Include background in export" checked={composition.backgroundInExport !== false}
      onChange={event => onChange({ ...composition, backgroundInExport: event.target.checked })} />Include in export</label>
    {composition.backgroundInExport === false && <p className="text-xs text-gray-400">Visible in the editor; transparent in exports. An explicit export color overrides this setting.</p>}
  </div>
}
