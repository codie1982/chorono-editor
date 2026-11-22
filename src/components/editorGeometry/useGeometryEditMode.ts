'use client'
import { useEffect, useState } from 'react'
import type { Layer } from '@/lib/types'
import type { SplineEditController } from '@/components/splineEdit/useSplineEditSelection'

export type GeometryEditLevel = 'point' | 'edge' | 'object'

export interface GeometryEditMode {
  readonly active: boolean
  readonly mode: GeometryEditLevel
  enter(mode?: GeometryEditLevel): boolean
  exit(): void
}

/** Owns transient Edit-panel focus for a single layer/document. Editable splines
 * reuse their existing sub-object controller; meshes own Point/Edge/Object
 * component sessions and generated splines retain their settings admission. Changing selection, kind or document invalidates the
 * session synchronously. No geometry, history or persisted state is changed. */
export function useGeometryEditMode(layer: Layer | null, spline: SplineEditController, document: AbortSignal): GeometryEditMode {
  const [session, setSession] = useState<{ layer: Layer['id']; kind: Layer['type']; document: AbortSignal; mode: GeometryEditLevel } | null>(null)
  const supported = layer?.type === 'spline' || layer?.type === 'mesh2d'
  useEffect(() => { setSession(null) }, [layer?.id, layer?.type, document])
  const subObjects = !!layer && spline.layerId === layer.id
  // Adding a geometry modifier can make direct point editing read-only. Retain
  // the active panel session so its settings remain reachable after Execute.
  useEffect(() => {
    if (subObjects && layer) setSession(spline.active ? { layer: layer.id, kind: layer.type, document, mode: spline.mode } : null)
  }, [subObjects, spline.active, spline.mode, layer?.id, layer?.type, document])
  const active = !!supported && (subObjects ? spline.active
    : session?.layer === layer?.id && session?.kind === layer?.type && session?.document === document)
  return { active, mode: subObjects ? spline.mode : session?.mode ?? 'object',
    enter(mode = 'object') {
      if (!supported || !layer || layer.locked || layer.hidden || layer.frozen || layer.instanceOf) return false
      setSession({ layer: layer.id, kind: layer.type, document, mode })
      if (subObjects) spline.enter(mode)
      return true
    },
    exit() { spline.exit(); setSession(null) },
  }
}
