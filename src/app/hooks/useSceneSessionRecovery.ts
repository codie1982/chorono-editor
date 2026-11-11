'use client'
import { useLayoutEffect, useRef, useState } from 'react'
import type { EditorStateReturn } from './useEditorState'
import type { BrowserRecoverySession } from '@/lib/editor/persistence/recovery/browserSessionRecovery'
import { SceneSessionRecovery, type RecoveryStatus } from '@/lib/editor/persistence/recovery/SceneSessionRecovery'
import { saveSessionCheckpoint } from '@/lib/editor/persistence/recovery/SessionCheckpointIO'

/** React/lifecycle adapter. Subscribes before pointer interaction, synchronously
 * journals committed edits and delegates bounded async IO. Actual unsaved large
 * edits/storage failures trigger the native leave-page guard, not a silent loss.
 * Hidden/pagehide flush; no animation polling or preview snapshots. The boundary
 * owns the database connection, while this hook owns subscription/listeners and
 * its coordinator. StrictMode cleanup never writes a default scene.
 */
export function useSceneSessionRecovery(editor: EditorStateReturn, session: BrowserRecoverySession) {
  const [status, setStatus] = useState<RecoveryStatus>({ state: session.warning ? 'error' : session.restored ? 'saved' : 'idle', safeToLeave: true, error: session.warning })
  const owner = useRef<SceneSessionRecovery>()
  useLayoutEffect(() => {
    let active = true
    const recovery = new SceneSessionRecovery({ id: session.id, sequence: session.sequence, storage: session.storage,
      save: (scene, metadata, signal) => saveSessionCheckpoint(scene, metadata, session.store, signal),
      onStatus: next => { if (active) setStatus(next) },
    })
    owner.current = recovery
    const unsubscribe = editor.subscribeCommitted(scene => recovery.request(scene))
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
  }, [editor.subscribeCommitted, session])
  return { ...status, retry: () => { owner.current?.request(editor.getCommittedScene()); owner.current?.flush() } }
}
