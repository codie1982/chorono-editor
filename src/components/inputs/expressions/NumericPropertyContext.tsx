'use client'
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react'
import type { ChronoScene, Layer } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { ExternalTimelineTime, OverrideMap } from '@/lib/evaluator'
import type { ParamValueMap } from '@/lib/runtime/paramResolver'
import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'

export interface NumericPropertyFrame { overrides: OverrideMap; expressionErrors?: ReadonlyMap<string, string>; paramValues: ParamValueMap }
interface Host { scene: ChronoScene; layerId: string; layer?: Layer; timeMs: number; timelineId?: string; externalTime?: ExternalTimelineTime | null; frame?: NumericPropertyFrame; getScene(): ChronoScene; dispatch(command: EditorCommand): void; isTransactionActive?(): boolean }
export interface NumericPropertyInput extends Host { path: string; label: string }
const HostContext = createContext<Host | null>(null)
const FieldContext = createContext<{ path: string; label: string } | null>(null)

/** Inspector composition boundary. Source getter is synchronous, independent of
 * React renders; private fixture hosts may fall back to their latest source ref.
 * One selected-layer lookup is shared by all fields. No global state,
 * subscriptions, polling or per-input evaluation loops. */
export function NumericPropertyProvider({ scene, layerId, dispatch, getScene, isTransactionActive, timeMs = 0, timelineId, externalTime, frame, children }: {
  scene?: ChronoScene; layerId?: string; dispatch?: Host['dispatch']; getScene?: Host['getScene']; isTransactionActive?: Host['isTransactionActive']; timeMs?: number; timelineId?: string; externalTime?: ExternalTimelineTime | null; frame?: NumericPropertyFrame; children: ReactNode
}) {
  const latest = useRef(scene); latest.current = scene
  const source = useRef(() => latest.current!)
  const layer = useMemo(() => scene?.layers.find(item => item.id === layerId), [scene, layerId])
  const computed = useMemo(() => !frame && scene && Object.keys(layer?.propertyExpressions?.fields ?? {}).length
    ? evaluateSceneFrame(scene, timeMs, { externalTime }) : frame, [scene, layer, timeMs, externalTime, frame])
  const value: Host | null = scene && layerId && dispatch ? { scene, layerId, layer, timeMs, timelineId, externalTime, frame: computed, dispatch, getScene: getScene ?? source.current, isTransactionActive } : null
  return <HostContext.Provider value={value}>{children}</HostContext.Provider>
}
/** Carry the existing schema/WireableField path to its numeric input without
 * inspecting DOM ancestry or guessing which equal-valued property was edited. */
export function NumericPropertyScope({ path, label, children }: { path: string; label: string; children: ReactNode }) {
  return <FieldContext.Provider value={{ path, label }}>{children}</FieldContext.Provider>
}
/** Resolve an explicitly registered field; unscoped legacy numeric inputs keep
 * their original value-only API until their owning A4 adapter is migrated. */
export function useNumericPropertyInput(path?: string, label?: string): NumericPropertyInput | null {
  const host = useContext(HostContext), field = useContext(FieldContext), target = path ?? field?.path
  return host && target ? { ...host, path: target, label: label ?? field?.label ?? target } : null
}
