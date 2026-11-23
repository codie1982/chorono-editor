'use client'
import type { ModifierDescriptor } from '@/lib/modifiers/types'

const inputClass = 'min-h-8 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 text-gray-100 focus-visible:outline focus-visible:outline-orange-300'
/** Schema-driven settings only: modifier classes own field definitions and
 * validation. Draft changes stay local until the host executes the stack.
 * Asset choices and selected element IDs are supplied by the owning editor. */
export function ModifierSettingsForm({ descriptor, settings, disabled, assets, pointIds = [], contourIds = [], objectIds = [], inputObjects = [], onChange }: {
  descriptor: ModifierDescriptor; settings: Readonly<Record<string, unknown>>; disabled?: boolean
  assets: readonly { id: string; name: string; type: string }[]
  pointIds?: readonly string[]; contourIds?: readonly string[]; objectIds?: readonly string[]
  inputObjects?: readonly { id: string; name: string }[]
  onChange(patch: Readonly<Record<string, unknown>>): void
}) {
  return <fieldset disabled={disabled} className="space-y-3" aria-label={`${descriptor.label} settings`}>
    {descriptor.fields.map(field => {
      const value = settings[field.key], label = `${descriptor.label} ${field.label}`
      if (field.kind === 'points' || field.kind === 'contours' || field.kind === 'objects') {
        const targets: string[] = Array.isArray(value) ? value : [], selected = field.kind === 'points' ? pointIds : field.kind === 'objects' ? objectIds : contourIds
        return <div key={field.key} className="space-y-1.5">
          <span className="block text-gray-300">{field.label} · {targets.length ? `${targets.length} selected` : 'All eligible'}</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={inputClass + ' !w-auto'} disabled={!selected.length} onClick={() => onChange({ [field.key]: [...selected] })}>Use selection</button>
            <button type="button" className={inputClass + ' !w-auto'} disabled={!targets.length} onClick={() => onChange({ [field.key]: [] })}>All</button>
          </div>
          {field.kind === 'objects' && <div role="group" aria-label={`${label} from stage input`} className="max-h-36 space-y-1 overflow-y-auto rounded border border-gray-700 p-2">
            {inputObjects.map(object => {
              const chosen = targets.length ? targets : inputObjects.map(item => item.id), checked = chosen.includes(object.id)
              return <label key={object.id} className="flex min-h-8 items-center gap-2"><input type="checkbox" aria-label={`${descriptor.label} target ${object.name || object.id}`} checked={checked}
                disabled={checked && chosen.length === 1} className="accent-orange-400" onChange={event => onChange({ [field.key]: event.currentTarget.checked ? [...chosen, object.id] : chosen.filter(id => id !== object.id) })} />
                <span className="truncate">{object.name || object.id}</span></label>
            })}
            {!inputObjects.length && <p className="text-gray-400">This stage needs spline Objects as input.</p>}
          </div>}
        </div>
      }
      return <label key={field.key} className="block space-y-1 text-gray-300">
        <span>{field.label}{field.unit ? ` (${field.unit})` : ''}</span>
        {field.kind === 'number' && <input aria-label={label} type="number" className={inputClass} min={field.min} max={field.max} step={field.step ?? 'any'}
          value={typeof value === 'number' && Number.isFinite(value) ? value : ''} onChange={e => onChange({ [field.key]: e.currentTarget.valueAsNumber })} />}
        {field.kind === 'select' && <select aria-label={label} className={inputClass} value={String(value ?? '')} onChange={e => onChange({ [field.key]: e.currentTarget.value })}>
          {field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>}
        {field.kind === 'boolean' && <input aria-label={label} type="checkbox" className="ml-2 accent-orange-400" checked={!!value} onChange={e => onChange({ [field.key]: e.currentTarget.checked })} />}
        {field.kind === 'asset' && <select aria-label={label} className={inputClass} value={String(value ?? '')} onChange={e => onChange({ [field.key]: e.currentTarget.value })}>
          <option value="">None</option>
          {!!value && !assets.some(asset => asset.id === value && asset.type === field.assetType) && <option value={String(value)}>Missing clip</option>}
          {assets.filter(asset => asset.type === field.assetType).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
        </select>}
      </label>
    })}
    {!descriptor.fields.length && <p className="text-gray-400">This step uses the geometry from the previous row.</p>}
  </fieldset>
}
