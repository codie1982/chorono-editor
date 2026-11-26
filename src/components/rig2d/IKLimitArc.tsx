import type { IKDiagnostic } from '@/lib/rig2d/diagnostics'
import type { IKAngleLimit, IKJoint } from '@/lib/rig2d/types'

/** Project joint-local directions through the solved parent's linear transform.
 * Constant CSS radius keeps ticks legible under zoom, reflection and unequal
 * scale. A multi-turn range displays one full circle and both authored bounds. */
export function IKLimitArc({ chain, joint, limit, zoom }: {
  chain: Extract<IKDiagnostic, { composition: unknown }>; joint: IKJoint; limit: IKAngleLimit; zoom: number
}) {
  const pivot = chain.composition[joint], m = chain.parentBasis
  const base = chain.referenceDeg + (joint === 'elbow' ? chain.angles.shoulder : 0)
  const active = chain[`${joint}Bound`]
  const min = limit.lockedDeg ?? limit.minDeg, max = limit.lockedDeg ?? limit.maxDeg
  const point = (angle: number, radius: number) => {
    const rad = ((base + angle) % 360) * Math.PI / 180
    const x = Math.cos(rad), y = Math.sin(rad)
    const dx = m ? m.a*x + m.c*y : x, dy = m ? m.b*x + m.d*y : y
    const scale = radius / Math.hypot(dx, dy)
    return [dx*scale, dy*scale].join(' ')
  }
  const span = Math.min(max - min, 360), steps = Math.max(1, Math.ceil(span / 6))
  const path = Array.from({ length: steps + 1 }, (_, i) => (i ? 'L' : 'M') + point(min + span*i/steps, 20)).join(' ')
  return <g aria-label={joint + ' angle limit'} transform={`translate(${pivot.x*zoom} ${pivot.y*zoom})`} stroke="#64e2d8" fill="none">
    <path d={path} stroke="#273032" strokeWidth="3.5"/><path d={path} strokeWidth="1.5"/>
    {(min === max ? [min] : [min, max]).map((angle, i) => {
      const hit = active === 'locked' || active === (i ? 'max' : 'min')
      return <path key={i} d={'M' + point(angle, 9) + 'L' + point(angle, 24)} stroke={hit ? '#ff9455' : '#64e2d8'} strokeWidth={hit ? 3 : 1.5}/>
    })}
  </g>
}
