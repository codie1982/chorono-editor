'use client'

import { useEffect } from 'react'
import ScrubInput from '../inputs/ScrubInput'
import { IKJointLimits } from './IKJointLimits'
import type { ChronoScene, Layer } from '@/lib/types'
import { EMPTY_IK_DIAGNOSTICS, selectedIKDiagnostics, type IKDiagnostics, type IKFailure } from '@/lib/rig2d/diagnostics'
import { hasInvalidPivotLink, supportsPivotLink } from '@/lib/rig2d/frame'
import { pickPrompt, type PivotPicking } from '../rig2d/usePivotPicking'

const control = 'rounded border border-gray-600 bg-gray-800 px-2.5 py-1.5 text-left hover:border-orange-400/70 focus-visible:outline-orange-300 disabled:opacity-40'
const inactiveReasons: Record<IKFailure, string> = {
  'zero-length': 'A segment has zero length at this frame.',
  'singular-parent': 'The parent transform is missing or has zero scale.',
  'invalid-binding': 'Check the joint limits and bindings. Joints and target must be eligible siblings.',
  'dependency-cycle': 'A circular dependency blocks this chain.',
}
const formatDistance = new Intl.NumberFormat('en', { maximumSignificantDigits: 4 })
/** Inspector for ordinary pivot links. Buttons arm the viewport with the
 * inspected owner pinned. Closing this inspector releases pick ownership. */
export function PivotLinkControls({ layer, scene, picking, diagnostics = EMPTY_IK_DIAGNOSTICS }: { layer: Layer; scene: ChronoScene; picking: PivotPicking; diagnostics?: IKDiagnostics }) {
  const { pick, cancel, apply, begin, error, disabled } = picking
  useEffect(() => cancel, [cancel])
  const name = (id: string) => scene.layers.find(item => item.id === id)?.name ?? '(missing layer)'
  const ik = layer.twoBoneIK2d
  const poseEdits = layer.pivotLink2d ? picking.unlinkEdits() : []
  const channelNames = { x: 'X', y: 'Y', rotationDeg: 'Dönüş' }
  const current = diagnostics.get(layer.id)
  const influence = current && current.status !== 'inactive' ? current.weight : ik?.weight ?? 1
  const chains = selectedIKDiagnostics(diagnostics, new Set([layer.id]))
  const hasLower = scene.layers.some(item => item.parentId === layer.parentId && item.pivotLink2d?.driverId === layer.id && !item.twoBoneIK2d)
  if (!supportsPivotLink(layer) && !layer.pivotLink2d && !ik && !chains.length) return <p className="text-xs text-gray-400">This layer cannot use pivot links or IK.</p>
  return <div aria-label="Link & IK settings" className="space-y-4 text-xs text-gray-200">
    <section className="space-y-2">
      <h3 className="font-semibold">Pivot link</h3>
      {layer.pivotLink2d ? <><p>Follows · {name(layer.pivotLink2d.driverId)}</p>
        <div className="flex flex-wrap gap-2">
          <button className={control} disabled={disabled || !!pick} onClick={() => apply({ kind: 'unlink' })}>Unlink pivots</button>
          <button className={control} disabled={disabled || !!pick} onClick={() => apply({ kind: 'unlinkKeepPose' })}>
            Pozu koruyarak ayır
          </button>
        </div>
        {poseEdits.length > 0 && <p className="text-gray-400">Bu karede kaydedilecek değerler: {poseEdits.map(edit =>
          channelNames[edit.key] + (edit.keyed ? ' (anahtar)' : '')).join(', ')}.</p>}</>
        : <button className={control} disabled={disabled || !!pick} onClick={() => begin('driver')}>Pick driver in viewport</button>}
    </section>
    <section className="space-y-2 border-t border-gray-700 pt-3">
      <h3 className="font-semibold">Two-bone IK</h3>
      {ik ? <><p>Lower segment · {name(ik.lowerId)}<br/>IK target · {name(ik.targetId)}</p>
        <fieldset disabled={disabled || !!pick || !current || current.status === 'inactive'} className="space-y-2 rounded border border-gray-700 p-2">
          <legend className="px-1 font-medium">IK / FK</legend>
          <label className="flex items-center justify-between gap-2">IK weight (%)
            <ScrubInput key={layer.id} value={Number((influence * 100).toFixed(3))}
              min={0} max={100} step={1} disableScrub fieldLabel="IK weight (%)" title="IK weight (%)" onChange={value => apply({ kind: 'setWeight', weight: value / 100 })} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className={control} disabled={influence === 0}
              onClick={() => apply({ kind: 'matchFK' })}>Match to FK</button>
            <button className={control} disabled={influence === 1}
              onClick={() => apply({ kind: 'matchIK' })}>Match to IK</button>
          </div>
          <p className="text-gray-400">0% FK · 100% IK. Match keeps the pose at this frame.</p>
        </fieldset>
        <div className="flex flex-wrap gap-2"><button className={control} disabled={disabled || !!pick} onClick={() => apply({kind:'flip'})}>Flip bend</button>
          <button className={control} disabled={disabled || !!pick} onClick={() => apply({kind:'clearIK'})}>Remove IK</button></div>
        <div className="flex flex-wrap gap-2">
          <button className={control} disabled={disabled || !!pick || !current || current.status === 'inactive'}
            title="Use this shoulder direction when the target folds an equal-length chain onto its root."
            onClick={() => apply({kind:'preferPose'})}>Prefer this pose</button>
          {ik.preferredShoulderOffsetDeg !== undefined && <button className={control} disabled={disabled || !!pick}
            onClick={() => apply({kind:'clearPreference'})}>Clear preferred pose</button>}
        </div>
        {(['shoulder', 'elbow'] as const).map(joint => {
          const saved = ik[`${joint}Limit`]
          const active = current?.status !== 'inactive' ? current : undefined
          return <IKJointLimits key={layer.id + joint + JSON.stringify(saved)} joint={joint} saved={saved}
            angle={active?.angles[joint]} bound={active?.[`${joint}Bound`]} disabled={disabled || !!pick}
            commit={limit => apply({ kind: 'setJointLimit', joint, limit })} />
        })}</>
        : <><button className={control} disabled={disabled || !!pick || !hasLower} onClick={() => begin('lower')}>Set up IK in viewport</button>
          <p className="text-gray-400">{hasLower ? 'Pick the lower segment, then a target at its tip.' : 'Link a lower segment to this layer to enable IK.'}</p></>}
    </section>
    {chains.length > 0 && <ul aria-label="IK reach" className="divide-y divide-gray-700 border-t border-gray-700">
      {chains.map(chain => <li key={chain.upperId} className="py-2">
        <p className="font-medium">{name(chain.upperId)} → {name(chain.targetId)}</p>
        {chain.status === 'inactive' ? <p className="text-amber-300">{inactiveReasons[chain.reason]}</p>
          : chain.status === 'reached' ? <p className="text-gray-400">Target reached</p>
          : <p className="text-orange-200">Target {formatDistance.format(chain.composition.distance)} px away · {chain.status === 'extended' ? 'fully extended' : chain.status === 'limited' ? 'joint limit' : chain.status === 'blended' ? 'IK weight ' + Math.round(chain.weight * 100) + '%' : 'fully folded'}</p>}
        {chain.status !== 'inactive' && <>
          {(chain.shoulderBound || chain.elbowBound) && <p>{[chain.shoulderBound && 'Shoulder ' + chain.shoulderBound,
            chain.elbowBound && 'Elbow ' + chain.elbowBound].filter(Boolean).join(' · ')}</p>}
          {chain.alternateBend && <p>Joint limits use the opposite bend.</p>}
        </>}
      </li>)}
    </ul>}
    {pick && <div className="space-y-2 border-l-2 border-orange-400 pl-2">
      <p role="status">{pickPrompt[pick.step]}{pick.step === 'target' ? ' of ' + name(pick.lowerId) : ''}.</p>
      <button className={control} onClick={cancel}>Cancel pick</button>
    </div>}
    {!ik && hasInvalidPivotLink(scene.layers, layer.id) && <p role="status" className="text-amber-300">Link or IK is inactive. Keep the joints and target in the same group, or remove the affected relationship.</p>}
    {error && <p role="alert" className="text-amber-300">{error}</p>}
  </div>
}
