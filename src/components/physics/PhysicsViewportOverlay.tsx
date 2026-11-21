'use client'

import { useMemo } from 'react'
import type { OverrideMap } from '@/lib/evaluator'
import { FractureOverlayGeometryResolver } from '@/lib/fracture/FractureOverlayGeometryResolver'
import type { ChronoScene } from '@/lib/types'
import type { PhysicsViewportOverlaySettings } from './PhysicsViewportOverlayState'

/**
 * Draws non-interactive fracture diagnostics above the editor Canvas.
 *
 * The SVG uses composition coordinates and the same evaluated frame overrides
 * as Canvas. It is hidden with the rest of editor chrome during playback and
 * never enters scene JSON, undo, preview capture or final export.
 */
export function PhysicsViewportOverlay({ scene, timeMs, overrides, settings }: {
  readonly scene: ChronoScene
  readonly timeMs: number
  readonly overrides?: OverrideMap
  readonly settings: PhysicsViewportOverlaySettings
}) {
  const frame = useMemo(() => settings.enabled
    ? new FractureOverlayGeometryResolver().resolve(scene, settings.recordId, timeMs, overrides)
    : null, [overrides, scene, settings.enabled, settings.recordId, timeMs])
  if (!frame) return null

  return <svg
    aria-hidden="true"
    data-testid="physics-viewport-overlay"
    data-record-id={frame.recordId}
    data-phase={frame.phase}
    viewBox={`0 0 ${scene.composition.width} ${scene.composition.height}`}
    className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible"
  >
    {settings.fragments && <g data-overlay="fragments" fill="none" stroke="#22d3ee" strokeWidth={1.25} vectorEffect="non-scaling-stroke">
      {frame.fragments.map(fragment => <polygon key={fragment.id} points={points(fragment.points)} />)}
    </g>}
    {settings.triangles && <g data-overlay="triangles" fill="none" stroke="#facc15" strokeOpacity={0.72} strokeWidth={0.8} vectorEffect="non-scaling-stroke">
      {frame.fragments.flatMap(fragment => trianglePolygons(fragment).map((triangle, index) =>
        <polygon key={`${fragment.id}:triangle:${index}`} points={points(triangle)} />))}
    </g>}
    {settings.colliders && <g data-overlay="colliders" fill="none" stroke="#fb7185" strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke">
      {frame.colliderPolygons.map(collider => <polygon key={collider.id} points={points(collider.points)} />)}
    </g>}
    {settings.centroids && <g data-overlay="centroids" fill="#0f172a" stroke="#a7f3d0" strokeWidth={1.25} vectorEffect="non-scaling-stroke">
      {frame.fragments.map(fragment => <g key={`${fragment.id}:centroid`} transform={`translate(${fragment.centroid.x} ${fragment.centroid.y})`}>
        <circle r={3.5} /><path d="M-6 0H6M0-6V6" fill="none" />
      </g>)}
    </g>}
  </svg>
}

function points(value: readonly { readonly x: number; readonly y: number }[]): string {
  return value.map(point => `${point.x},${point.y}`).join(' ')
}

function trianglePolygons(fragment: {
  readonly points: readonly { readonly x: number; readonly y: number }[]
  readonly triangleIndices: readonly number[]
}): Array<Array<{ readonly x: number; readonly y: number }>> {
  const result: Array<Array<{ readonly x: number; readonly y: number }>> = []
  for (let index = 0; index < fragment.triangleIndices.length; index += 3) {
    result.push([
      fragment.points[fragment.triangleIndices[index]],
      fragment.points[fragment.triangleIndices[index + 1]],
      fragment.points[fragment.triangleIndices[index + 2]],
    ])
  }
  return result
}
