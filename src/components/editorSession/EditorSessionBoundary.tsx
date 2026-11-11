'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { openBrowserRecovery, type BrowserRecoverySession } from '@/lib/editor/persistence/recovery/browserSessionRecovery'

/** Mount the editor only after recovery has been read. This prevents the demo,
 * MCP mutations or a late async restore from overwriting manual work. Loading
 * owns no scene history. Cancelled startup releases media creators/connections.
 */
export function EditorSessionBoundary({ children, databaseName }: { children(session: BrowserRecoverySession): ReactNode; databaseName?: string }) {
  const [session, setSession] = useState<BrowserRecoverySession>()
  const [error, setError] = useState<string>()
  const startup = useRef<{ name?: string; active: boolean; promise?: Promise<BrowserRecoverySession>; value?: BrowserRecoverySession }>()
  if (!startup.current || startup.current.name !== databaseName) startup.current = { name: databaseName, active: false }
  useEffect(() => {
    const owner = startup.current!; owner.active = true
    // StrictMode cleanup/setup must share the same lock and load operation.
    // Only an actual unmount releases this owner after the replay microtask.
    owner.promise ??= openBrowserRecovery(databaseName)
    void owner.promise.then(result => { owner.value = result; if (owner.active) setSession(result) }, failure => {
      if (owner.active) setError((failure as Error).message)
    })
    return () => { owner.active = false; queueMicrotask(() => {
      if (!owner.active) void owner.promise?.then(result => { if (!owner.active) result.dispose() }, () => {})
    }) }
  }, [databaseName])
  if (error) return <div role="alert" className="flex h-screen flex-col items-center justify-center gap-3 bg-gray-950 text-sm text-amber-200">
    <p>Workspace recovery could not start: {error}</p><button className="underline" onClick={() => location.reload()}>Retry loading workspace</button></div>
  if (!session) return <div role="status" className="flex h-screen items-center justify-center bg-gray-950 text-sm text-gray-300">Restoring workspace…</div>
  return children(session)
}
