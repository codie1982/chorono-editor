'use client'

import { useMemo } from 'react'
import type { OverrideMap } from '@/lib/evaluator'
import { FractureOverlayGeometryResolver } from '@/lib/fracture/FractureOverlayGeometryResolver'
import { FractureRenderColliderAnalyzer } from '@/lib/fracture/FractureRenderColliderAnalyzer'
import type { ChronoScene } from '@/lib/types'
import type { PhysicsViewportOverlaySettings } from './PhysicsViewportOverlayState'

const geometryResolver = new FractureOverlayGeometryResolver()
const renderColliderAnalyzer = new FractureRenderColliderAnalyzer()

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
  const result = useMemo(() => {
    if (!settings.enabled) return null
    const frame = geometryResolver.resolve(scene, settings.recordId, timeMs, overrides)
    return frame ? { frame, colliderAnalysis: renderColliderAnalyzer.analyzeFrame(frame) } : null
  }, [overrides, scene, settings.enabled, settings.recordId, timeMs])
  const frame = result?.frame
  if (!frame) return null
  const colliderAnalysis = result.colliderAnalysis

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
    {settings.colliderDelta && colliderAnalysis.status !== 'unavailable' && <g data-overlay="collider-delta"
      fill="none" stroke="#f97316" strokeWidth={1.5} vectorEffect="non-scaling-stroke">
      {colliderAnalysis.deltaLines.map((line, index) => <g key={`${line.layerId}:${index}`}>
        <line x1={line.renderPoint.x} y1={line.renderPoint.y} x2={line.colliderPoint.x} y2={line.colliderPoint.y} />
        <circle cx={line.renderPoint.x} cy={line.renderPoint.y} r={2} fill="#22d3ee" stroke="none" />
        <circle cx={line.colliderPoint.x} cy={line.colliderPoint.y} r={2} fill="#fb7185" stroke="none" />
      </g>)}
    </g>}
    {settings.topologyEvent && <DiagnosticBadge y={12}
      primary={frame.atEvent ? `Topology event · tick ${frame.eventTick}`
        : frame.phase === 'source' ? 'Before event · source topology' : 'After event · fragment topology'}
      secondary={`${formatNumber(frame.eventTimeMs)} ms · ${frame.renderPolygons.length} visible ${frame.renderPolygons.length === 1 ? 'body' : 'bodies'}`} />}
    {settings.colliderDelta && <DiagnosticBadge y={settings.topologyEvent ? 62 : 12}
      primary={colliderAnalysis.status === 'unavailable' ? 'Collider delta unavailable'
        : colliderAnalysis.status === 'pass' ? 'Collider delta · aligned' : 'Collider delta · review'}
      secondary={colliderAnalysis.status === 'unavailable' ? colliderAnalysis.reason
        : `maximum ${formatNumber(colliderAnalysis.maxBoundaryDeltaPx)} px · ${colliderAnalysis.sampleCount} samples`} />}
  </svg>
}

function DiagnosticBadge({ y, primary, secondary }: { readonly y: number; readonly primary: string; readonly secondary: string }) {
  return <g data-overlay="topology-status" transform={`translate(12 ${y})`}>
    <rect width={260} height={42} rx={6} fill="#0f172a" fillOpacity={0.92} stroke="#475569" />
    <text x={10} y={17} fill="#f8fafc" fontSize={11} fontWeight={600}>{primary}</text>
    <text x={10} y={32} fill="#cbd5e1" fontSize={9}>{secondary.length > 48 ? `${secondary.slice(0, 47)}…` : secondary}</text>
  </g>
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 3, useGrouping: false })
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
