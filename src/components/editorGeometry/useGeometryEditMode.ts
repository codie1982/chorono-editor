'use client'
import { useEffect, useRef, useState } from 'react'
import type { Layer } from '@/lib/types'
import type { SplineEditController } from '@/components/splineEdit/useSplineEditSelection'

export type GeometryEditLevel = 'point' | 'edge' | 'object'

export interface GeometryEditMode {
  readonly active: boolean
  readonly mode: GeometryEditLevel
  enter(mode?: GeometryEditLevel): boolean
  exit(): void
}

/** Owns transient source-edit focus for a single layer/document. Modifier UI is
 * independent of this session. Editable splines
 * reuse their existing sub-object controller; meshes own Point/Edge/Object
 * component sessions and generated splines retain their settings admission. Changing selection, kind or document invalidates the
 * session synchronously. No geometry, history or persisted state is changed. */
export function useGeometryEditMode(layer: Layer | null, spline: SplineEditController, document: AbortSignal): GeometryEditMode {
  const [session, setSession] = useState<{ layer: Layer['id']; kind: Layer['type']; document: AbortSignal; mode: GeometryEditLevel } | null>(null)
  const supported = layer?.type === 'spline' || layer?.type === 'mesh2d'
  useEffect(() => { setSession(null) }, [layer?.id, layer?.type, document])
  const subObjects = !!layer && spline.layerId === layer.id
  const previousSubObjects = useRef(subObjects)
  const sameSession = session?.layer === layer?.id && session?.kind === layer?.type && session?.document === document
  const returningToSource = subObjects && !previousSubObjects.current && sameSession
  // Adding a geometry modifier can make direct point editing read-only. Retain
  // an existing source-edit session, without creating one for modifier actions.
  useEffect(() => {
    const returning = subObjects && !previousSubObjects.current
    previousSubObjects.current = subObjects
    if (!subObjects || !layer) return
    if (spline.active) setSession({ layer: layer.id, kind: layer.type, document, mode: spline.mode })
    // Disabling/removing the final operation or Bake restores an editable
    // source. Its old sub-selection was pruned; restore Object mode only within
    // the existing session. Explicit Escape/exit still closes it.
    else if (returning && sameSession) {
      spline.enter('object'); setSession({ layer: layer.id, kind: layer.type, document, mode: 'object' })
    } else setSession(null)
  }, [subObjects, spline.active, spline.mode, layer?.id, layer?.type, document, sameSession, spline.enter])
  const active = !!supported && (subObjects ? spline.active || returningToSource : sameSession)
  return { active, mode: returningToSource ? 'object' : subObjects ? spline.mode : session?.mode ?? 'object',
    enter(mode = 'object') {
      if (!supported || !layer || layer.locked || layer.hidden || layer.frozen || layer.instanceOf) return false
      setSession({ layer: layer.id, kind: layer.type, document, mode })
      if (subObjects) spline.enter(mode)
      return true
    },
    exit() { spline.exit(); setSession(null) },
  }
}
