import { useCallback, useEffect, useRef, useState } from 'react'
import { RuntimeFrameScheduler, type RuntimeFrameSignal } from '@/lib/runtime/scheduling/RuntimeFrameScheduler'

/** React lifecycle owner for the domain-independent scheduler. One instance per
 * mounted runtime; effect cleanup cancels work, including StrictMode replay.
 * Input may invalidate before effects run; start publishes that pending intent.
 * React state stores detached counters only, never scene buffers or event data. */
export function useRuntimeFrameSignal(segment: boolean, stateMachine: boolean, hostDriven: boolean) {
  const [signal, setSignal] = useState<RuntimeFrameSignal>({ frameRevision: 0, segmentTick: 0, smTestTick: 0 })
  const owner = useRef<RuntimeFrameScheduler>()
  if (!owner.current) owner.current = new RuntimeFrameScheduler(setSignal,
    callback => requestAnimationFrame(callback), id => cancelAnimationFrame(id))
  const scheduler = owner.current
  useEffect(() => { scheduler.start(); return () => scheduler.stop() }, [scheduler])
  useEffect(() => { scheduler.setDemand(segment, stateMachine, hostDriven) }, [scheduler, segment, stateMachine, hostDriven])
  const invalidate = useCallback(() => scheduler.invalidate(), [scheduler])
  const acknowledge = useCallback(() => scheduler.acknowledge(), [scheduler])
  return { ...signal, invalidate, acknowledge }
}
