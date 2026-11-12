'use client'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { sessionOutputFilename, validSessionId } from '@/lib/editor/session/sessionIdentity'

interface SessionIdentityContext { id: string; getId(): string; adopt(id: string): void }
const SessionContext = createContext<SessionIdentityContext | null>(null)

/** Logical project session identity, separate from the private recovery tab slot.
 * Adoption updates the ref synchronously before resetHistory publishes its
 * commit; UI state follows through React. No global mutable download setting. */
export function SessionOutputProvider({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const [id, setId] = useState(sessionId), current = useRef(id)
  const getId = useCallback(() => current.current, [])
  const adopt = useCallback((next: string) => { if (!validSessionId(next)) throw new Error('Invalid session ID.'); current.current = next; setId(next) }, [])
  return <SessionContext.Provider value={{ id, getId, adopt }}>{children}</SessionContext.Provider>
}
/** Resolve the owning editor identity; standalone exporters may have no provider. */
export function useSessionIdentity() { return useContext(SessionContext) }
/** Existing exporters keep their formats; only the UI download basename changes. */
export function useSessionOutputFilename() { const session = useSessionIdentity(); return (name: string) => sessionOutputFilename(name, session?.id) }
