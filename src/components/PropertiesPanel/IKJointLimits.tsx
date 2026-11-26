'use client'
import { useState } from 'react'
import type { IKAngleLimit, IKJoint } from '@/lib/rig2d/types'
import { validLimit, type Bound } from '@/lib/rig2d/jointLimits'

const button = 'rounded border border-gray-600 bg-gray-800 px-2 py-1 hover:border-orange-400 disabled:opacity-40'

/** Edit one joint in local clockwise degrees. Inputs are drafts until Apply.
 * The parent keys this form by saved settings so Undo and owner changes reload
 * the drafts. Lock captures the evaluated angle and retains the editable range. */
export function IKJointLimits({ joint, saved, angle, bound, disabled, commit }: {
  joint: IKJoint; saved?: IKAngleLimit; angle?: number; bound?: Bound; disabled: boolean
  commit: (limit?: IKAngleLimit) => void
}) {
  const name = joint === 'shoulder' ? 'Shoulder' : 'Elbow'
  const center = 360 * Math.round((angle ?? 0) / 360)
  const [min, setMin] = useState(String(saved?.minDeg ?? center - 180))
  const [max, setMax] = useState(String(saved?.maxDeg ?? center + 180))
  const enabled = saved?.enabled ?? false
  const draft = { enabled: true, minDeg: Number(min), maxDeg: Number(max) }
  const valid = min.trim() !== '' && max.trim() !== '' && validLimit(draft)
  const locked = saved?.lockedDeg !== undefined
  return <fieldset disabled={disabled} className="space-y-2 rounded border border-gray-700 px-2 pb-2">
    <legend className="px-1 font-medium">{name} limit</legend>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label><input type="checkbox" className="mr-1 accent-orange-400" checked={enabled}
        aria-label={name + ' limit enabled'} onChange={() => commit(saved ? { ...saved, enabled: !enabled } : draft)} />Enabled</label>
      {angle !== undefined && <span className="tabular-nums">{Number(angle.toFixed(2))}°{bound && ' · ' + bound}</span>}
    </div>
    {enabled && <><div className="flex flex-wrap items-end gap-2">
      {([['Min', min, setMin], ['Max', max, setMax]] as const).map(([label, value, set]) =>
        <label key={label} className="flex min-w-16 flex-1 flex-col gap-1">{label} (°)
          <input type="number" step="any" value={value} aria-label={name + ' ' + label} disabled={locked}
            className="w-full rounded border border-gray-600 bg-gray-800 px-1.5 py-1" onChange={e => set(e.target.value)} />
        </label>)}
      <button className={button} disabled={locked || !valid || (saved?.minDeg === draft.minDeg && saved?.maxDeg === draft.maxDeg)}
        onClick={() => commit(draft)}>Apply</button></div>
      {!valid && <p role="alert">Enter two finite angles with Min ≤ Max.</p>}
      <button className={button} disabled={!locked && angle === undefined} onClick={() => {
        if (!saved) return
        const { lockedDeg, ...bounds } = saved
        commit(lockedDeg !== undefined ? bounds : { ...bounds, lockedDeg: Math.max(bounds.minDeg, Math.min(bounds.maxDeg, angle!)) })
      }}>{locked ? 'Unlock angle' : 'Lock current angle'}</button>
    </>}
    {saved && <button className={button + ' ml-2'} onClick={() => commit()}>Reset</button>}
  </fieldset>
}
