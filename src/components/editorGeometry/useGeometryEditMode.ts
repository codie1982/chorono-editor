'use client'
import { useEffect, useState } from 'react'
import type { Layer } from '@/lib/types'
import type { SplineEditController } from '@/components/splineEdit/useSplineEditSelection'

export interface GeometryEditMode {
  readonly active: boolean
  enter(): void
  exit(): void
}

/** Owns transient Edit-panel focus for a single layer/document. Editable splines
 * reuse their existing sub-object controller; meshes and generated splines keep
 * a settings-only session. Changing selection, kind or document invalidates the
 * session synchronously. No geometry, history or persisted state is changed. */
export function useGeometryEditMode(layer: Layer | null, spline: SplineEditController, document: AbortSignal): GeometryEditMode {
  const [session, setSession] = useState<{ layer: Layer['id']; kind: Layer['type']; document: AbortSignal } | null>(null)
  const supported = layer?.type === 'spline' || layer?.type === 'mesh2d'
  useEffect(() => { setSession(null) }, [layer?.id, layer?.type, document])
  const subObjects = !!layer && spline.layerId === layer.id
  // Adding a geometry modifier can make direct point editing read-only. Retain
  // the active panel session so its settings remain reachable after Execute.
  useEffect(() => {
    if (subObjects && layer) setSession(spline.active ? { layer: layer.id, kind: layer.type, document } : null)
  }, [subObjects, spline.active, layer?.id, layer?.type, document])
  const active = !!supported && (subObjects ? spline.active
    : session?.layer === layer?.id && session?.kind === layer?.type && session?.document === document)
  return { active,
    enter() {
      if (!supported || !layer) return
      setSession({ layer: layer.id, kind: layer.type, document })
      if (subObjects) spline.enter('object')
    },
    exit() { spline.exit(); setSession(null) },
  }
}
