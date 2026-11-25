import { useRef } from 'react'
import type { Layer } from '@/lib/types'
import { meshEditStageId } from '@/lib/editor/modifiers/meshEditStageId'

/** Own one modifier ID for an Edit session, independent of tools, pointer
 * gestures, previews and Undo/Redo. Reuse an existing enabled tail Edit Mesh on
 * entry; otherwise reserve an ID without writing a stage until the first edit.
 * Undoing that first edit retains the ID for the next gesture. Selection,
 * document or mode exit releases it; nothing is persisted outside the stack. */
export function useMeshEditSession(active: boolean, layer: Layer | null, document: AbortSignal): string | null {
  const session = useRef<{ layerId: string; document: AbortSignal; modifierId: string } | null>(null)
  if (!active || layer?.type !== 'mesh2d') session.current = null
  else if (!session.current || session.current.layerId !== layer.id || session.current.document !== document) {
    session.current = { layerId: layer.id, document,
      modifierId: meshEditStageId(layer) }
  }
  return session.current?.modifierId ?? null
}
