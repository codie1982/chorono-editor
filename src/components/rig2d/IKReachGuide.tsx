import type { TwoBoneIK2D } from '@/lib/rig2d/types'
import { IKLimitArc } from './IKLimitArc'
import type { IKDiagnostic } from '@/lib/rig2d/diagnostics'

/** Draw solved composition points in CSS pixels. The open crosshair clears the
 * tip ring when coincident. Only an out-of-reach target has a residual line. */
export function IKReachGuide({ chain, zoom, label, ik }: {
  chain: Extract<IKDiagnostic, { composition: unknown }>; zoom: number; label: string; ik?: TwoBoneIK2D
}) {
  const { elbow, tip, target } = chain.composition
  const x = tip.x * zoom, y = tip.y * zoom, tx = target.x * zoom, ty = target.y * zoom
  const cross = 'M -12 0 h 5 M 7 0 h 5 M 0 -12 v 5 M 0 7 v 5'
  return <g data-relation="ik" aria-label={label} fill="none">
    <title>{label}</title>
    <line x1={elbow.x*zoom} y1={elbow.y*zoom} x2={x} y2={y} stroke="#283330" strokeWidth="3" strokeDasharray="2 4" />
    <line x1={elbow.x*zoom} y1={elbow.y*zoom} x2={x} y2={y} stroke="#64e2d8" strokeWidth="1.5" strokeDasharray="2 4" />
    {(['shoulder', 'elbow'] as const).map(joint => {
      const limit = ik?.[`${joint}Limit`]
      return limit?.enabled && <IKLimitArc key={joint} joint={joint} limit={limit} chain={chain} zoom={zoom} />
    })}
    {chain.status !== 'reached' && <g aria-label="IK target gap">
      <line x1={x} y1={y} x2={tx} y2={ty} stroke="#422719" strokeWidth="2.5" />
      <line x1={x} y1={y} x2={tx} y2={ty} stroke="#ffad7d" />
    </g>}
    <g aria-label="IK target" data-ik-target={chain.targetId} transform={`translate(${tx} ${ty})`} strokeLinecap="round">
      <path d={cross} stroke="#202523" strokeWidth="4"/><path d={cross} stroke="#64e2d8" strokeWidth="2"/>
    </g>
    <g aria-label="Solved tip" transform={`translate(${x} ${y})`}>
      <circle r="4.5" stroke="#202523" strokeWidth="4"/><circle r="4.5" stroke="#ffbf94" strokeWidth="2"/>
    </g>
  </g>
}
