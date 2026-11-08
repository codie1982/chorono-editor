import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SceneParameter, SceneParameterValue } from '@/lib/types'
import { ParameterStore } from '@/lib/runtime/params/ParameterStore'
import { buildParamValues } from '@/lib/runtime/paramResolver'

/** Preview-local parameters backed by the existing ParameterStore. Defaults
 * remain borrowed scene data; explicit overrides/unknown keys use its canonical
 * same-value and subscription semantics. No scene/undo mutation or global store
 * occurs. readValues returns a fresh effective map for a frame; paramValues is
 * identity-stable until source defaults or a real override changes. Subscription
 * setup rechecks revision to catch writes between render and the first commit. */
export function useRuntimeParameters(parameters: SceneParameter[]) {
  const owner = useRef<ParameterStore>()
  if (!owner.current) owner.current = new ParameterStore()
  const store = owner.current
  const [revision, setRevision] = useState(store.revision)
  useEffect(() => {
    const changed = () => setRevision(store.revision)
    const release = store.subscribe(changed)
    changed()
    return release
  }, [store])
  const readValues = useCallback(() => buildParamValues(parameters, store.snapshot()), [parameters, store])
  const paramValues = useMemo(readValues, [readValues, revision])
  const setParamOverride = useCallback((id: string, value: SceneParameterValue) => store.set(id, value), [store])
  const resetParams = useCallback(() => store.clear(), [store])
  return { paramValues, readValues, setParamOverride, resetParams }
}
