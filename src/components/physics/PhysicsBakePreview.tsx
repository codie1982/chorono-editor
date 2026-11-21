'use client'

import { useEffect, useMemo, useState } from 'react'
import type { RigidBodyBakePreview } from '@/lib/bake'
import type { ChronoScene } from '@/lib/types'
import type { RigidBodySnapshot } from '@/lib/types/physics'
import FractureEventSummary from './FractureEventSummary'

/**
 * Renders a scrub-capable, read-only SVG view of a retained rigid pose clip.
 * It samples the same dense cache used to compile timeline tracks and applies
 * the fracture visibility switch at the event tick. This preview never writes
 * scene transforms and is intentionally separate from the final renderer;
 * renderer/export parity is validated after Apply through normal tracks.
 */
export default function PhysicsBakePreview({ scene, preview }: {
  readonly scene: ChronoScene
  readonly preview: RigidBodyBakePreview
}) {
  const event = preview.recipe.fractureEvents?.[0]
  const [timeMs, setTimeMs] = useState(event?.timeMs ?? Math.min(1000, preview.recipe.durationMs))
  useEffect(() => setTimeMs(event?.timeMs ?? Math.min(1000, preview.recipe.durationMs)), [event?.timeMs, preview])
  const bodies = useMemo(() => preview.recipe.bodies.map((body, index) => ({
    body,
    index,
    pose: preview.clip.sample(body.bodyId, timeMs),
  })), [preview, timeMs])
  const step = 1000 / preview.recipe.sampleFps
  return <section aria-label="Physics simulation preview" className="rounded border border-gray-700 bg-gray-950/60 p-2">
    <div className="mb-2 flex items-center justify-between gap-2 text-[10px]">
      <span className="font-medium text-gray-300">Simulation cache</span>
      <span className="font-mono tabular-nums text-gray-400">{Math.round(timeMs)} ms</span>
    </div>
    <svg role="img" aria-label="Scrubbable rigid body simulation preview"
      viewBox={`0 0 ${scene.composition.width} ${scene.composition.height}`}
      className="aspect-video w-full rounded border border-gray-800 bg-gray-950">
      <rect width={scene.composition.width} height={scene.composition.height} fill={scene.composition.backgroundColor || '#111827'} />
      {bodies.map(({ body, index, pose }) => isVisible(body, event, timeMs) && <BodyShape key={body.bodyId} body={body} index={index}
        transform={`translate(${pose.centerX} ${pose.centerY}) rotate(${pose.angleDeg})`} />)}
    </svg>
    <label className="mt-2 flex flex-col gap-1 text-[10px] text-gray-400">
      Preview time
      <input aria-label="Physics preview time" type="range" min={0} max={preview.recipe.durationMs} step={step}
        value={timeMs} onChange={eventValue => setTimeMs(Number(eventValue.target.value))}
        className="w-full accent-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400" />
    </label>
    {event && <FractureEventSummary event={event} />}
  </section>
}

/** Decide parent/fragment visibility at the single supported topology event. */
function isVisible(body: RigidBodySnapshot, event: NonNullable<RigidBodyBakePreview['recipe']['fractureEvents']>[number] | undefined, timeMs: number): boolean {
  if (!event) return true
  if (body.bodyId === event.sourceBodyId) return timeMs < event.timeMs
  if (event.fragmentBodyIds.includes(body.bodyId)) return timeMs >= event.timeMs
  return true
}

/** Draw a collider-space rectangle or convex fragment around its sampled COM. */
function BodyShape({ body, index, transform }: {
  readonly body: RigidBodySnapshot
  readonly index: number
  readonly transform: string
}) {
  const staticBody = body.motionType === 'static'
  const fill = staticBody ? '#64748b' : fragmentColor(index)
  const common = { fill, fillOpacity: staticBody ? 0.72 : 0.82, stroke: staticBody ? '#cbd5e1' : '#f8fafc', strokeWidth: 1.5 }
  if (body.colliderVerticesPx?.length) {
    return <polygon transform={transform} points={body.colliderVerticesPx.map(point => `${point.x},${point.y}`).join(' ')} {...common} />
  }
  return <rect transform={transform} x={-body.widthPx / 2} y={-body.heightPx / 2}
    width={body.widthPx} height={body.heightPx} rx={staticBody ? 0 : 2} {...common} />
}

/** Stable high-contrast fragment palette; colour is decorative, shape remains visible. */
function fragmentColor(index: number): string {
  return ['#2563eb', '#0891b2', '#7c3aed', '#db2777', '#ea580c', '#16a34a'][index % 6]
}
