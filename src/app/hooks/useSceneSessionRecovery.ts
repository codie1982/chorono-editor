'use client'
import { useLayoutEffect, useRef, useState } from 'react'
import type { EditorStateReturn } from './useEditorState'
import type { BrowserRecoverySession } from '@/lib/editor/persistence/recovery/browserSessionRecovery'
import { SceneSessionRecovery, type RecoveryStatus } from '@/lib/editor/persistence/recovery/SceneSessionRecovery'
import { saveSessionCheckpoint } from '@/lib/editor/persistence/recovery/SessionCheckpointIO'
import { useSessionIdentity } from '@/components/editorSession/SessionOutputContext'
import { TAB_KEY } from '@/lib/editor/persistence/recovery/SessionCheckpoint'

/** React/lifecycle adapter. Subscribes before pointer interaction, synchronously
 * journals committed edits and delegates bounded async IO. Actual unsaved large
 * edits/storage failures trigger the native leave-page guard, not a silent loss.
 * Hidden/pagehide flush; no animation polling or preview snapshots. The boundary
 * owns the database connection, while this hook owns subscription/listeners and
 * its coordinator. StrictMode cleanup never writes a default scene.
 */
export function useSceneSessionRecovery(editor: EditorStateReturn, session: BrowserRecoverySession) {
  const identity = useSessionIdentity()
  const [status, setStatus] = useState<RecoveryStatus>({ state: session.warning ? 'error' : session.restored ? 'saved' : 'idle', safeToLeave: true, error: session.warning })
  const owner = useRef<SceneSessionRecovery>()
  useLayoutEffect(() => {
    let active = true
    const recovery = new SceneSessionRecovery({ id: session.id, slotId: session.slotId, getSessionId: identity?.getId,
      sequence: session.sequence, storage: session.storage,
      onCheckpoint: metadata => { try { sessionStorage.setItem(TAB_KEY, metadata.id) } catch { /* IDB/latest fallback remains. */ } },
      save: (scene, metadata, signal, history) => saveSessionCheckpoint(scene, metadata, session.store, signal, undefined, history),
      onStatus: next => { if (active) setStatus(next) },
    })
    owner.current = recovery
    const unsubscribe = editor.subscribeHistory(history => recovery.requestHistory(history))
    session.release()
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (recovery.safeToLeave) return
      recovery.flush(); event.preventDefault(); event.returnValue = ''
    }
    const flush = () => recovery.flush()
    const hidden = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', hidden)
    return () => { active = false; unsubscribe(); recovery.dispose(); owner.current = undefined
      window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden) }
  }, [editor.subscribeHistory, session, identity?.getId])
  return { ...status, retry: () => { owner.current?.requestHistory(editor.getCommittedHistory()); owner.current?.flush() } }
}
