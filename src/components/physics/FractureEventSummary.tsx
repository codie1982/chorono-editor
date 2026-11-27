import type { RigidFractureEvent } from '@/lib/types/physics'

/**
 * Presents persisted fracture trigger evidence in preview and inspection UI.
 *
 * The component is read-only and owns no state. It distinguishes authored
 * thresholds from measured impact evidence and labels explosion parameters as
 * one-shot external energy so a stored bake remains understandable after its
 * transient simulation job has been released.
 */
export default function FractureEventSummary({ event }: { readonly event: RigidFractureEvent }) {
  const impact = event.trigger?.kind === 'impact'
  const realization = impact ? event.realization : undefined
  return <section aria-label="Fracture trigger evidence"
    className="mt-3 space-y-2 rounded border border-gray-700 bg-gray-950/50 p-3 text-xs leading-5">
    <div className="flex items-center justify-between gap-2">
      <h5 className="font-semibold text-gray-100">Fracture trigger</h5>
      <span className="rounded border border-blue-800/70 bg-blue-950/30 px-2 py-0.5 font-medium text-blue-100">
        {impact ? 'Impact' : 'Time'}
      </span>
    </div>
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
      <dt className="text-gray-400">Event</dt>
      <dd className="text-right font-mono text-gray-200">{format(event.timeMs, 3)} ms · tick {event.tick}</dd>
      {impact && <>
        <dt className="text-gray-400">Minimum speed</dt>
        <dd className="text-right font-mono text-gray-200">
          {format(event.trigger.minimumRelativeNormalSpeedPxPerSecond, 1)} px/s
        </dd>
      </>}
      {realization && <>
        <dt className="text-gray-400">Measured speed</dt>
        <dd className="text-right font-mono text-emerald-200">
          {format(realization.relativeNormalSpeedPxPerSecond, 1)} px/s
        </dd>
        <dt className="text-gray-400">Collider</dt>
        <dd title={realization.contactBodyId} className="truncate text-right font-mono text-gray-200">
          {realization.contactBodyId}
        </dd>
        <dt className="text-gray-400">Contact point</dt>
        <dd className="text-right font-mono text-gray-200">
          {format(realization.contactPointPx.x, 1)}, {format(realization.contactPointPx.y, 1)} px
        </dd>
      </>}
    </dl>
    {event.explosion && <div role="status"
      className="rounded border border-amber-800/70 bg-amber-950/25 p-2 text-amber-100">
      <p className="font-medium">Artistic explosion · external energy</p>
      <p className="mt-1 text-amber-200/90">
        Applied once · radial {format(event.explosion.radialVelocityPxPerSecond, 1)} px/s · directional{' '}
        {format(event.explosion.directionalVelocityPxPerSecond, 1)} px/s at {format(event.explosion.directionDeg, 1)}° · spin{' '}
        {format(event.explosion.spinVelocityDegPerSecond, 1)}°/s · seed {event.explosion.seed}
      </p>
    </div>}
  </section>
}

/** Format finite persisted values without hiding useful fractional evidence. */
function format(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.?0+$/, '')
}
