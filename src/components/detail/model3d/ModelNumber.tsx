'use client'
import ScrubInput from '@/components/inputs/ScrubInput'
import { ModelKeyButton } from './ModelAnimationKeyContext'

/** The 3D inspectors share the 2D text-and-scrub numeric control. Drafts and
 * bounds are validated by ScrubInput before source or view-local callbacks run;
 * the compact row/column layout belongs only to the 3D inspector. */
export function ModelNumber({ label, value, onChange, step = .1, disabled = false, min, max, layout = 'row', keyPath }: {
  label: string; value: number; onChange(value: number): void; step?: number; disabled?: boolean; min?: number; max?: number; layout?: 'row' | 'column'; keyPath?: string
}) {
  const display = Number(value.toFixed(Math.abs(value) < .001 ? 8 : 5))
  return <div className={`min-w-0 gap-2 text-xs ${layout === 'row' ? 'flex items-center justify-between' : 'flex flex-col'}`}>
    <span className="min-w-0">{label}</span>
    <span className={`${layout === 'row' ? 'w-28 shrink-0' : 'w-full'} flex items-center gap-1`}>
      <ScrubInput value={display} onChange={onChange} step={step} min={min} max={max} disabled={disabled} fieldLabel={label} className="text-right" />
      {keyPath && <ModelKeyButton path={keyPath} />}
    </span>
  </div>
}
