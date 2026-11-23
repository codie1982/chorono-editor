'use client'
import { useState } from 'react'
import type { SplineTangents } from '@/lib/spline/edit/tangents'

export interface SplineTangentClipboard { readonly value: SplineTangents | null; write(value: SplineTangents): void }
/** Editor-document-owned clipboard, shared by panel and viewport menu. Survives
 * selection, mode and layer changes; document replacement invalidates it during
 * render. Nothing enters scene JSON, OS clipboard or Undo. Old aborted document
 * callbacks cannot populate a new document's clipboard. */
export function useSplineTangentClipboard(document?: AbortSignal): SplineTangentClipboard {
  const [entry, setEntry] = useState<{ document?: AbortSignal; value: SplineTangents } | null>(null)
  return { value: entry?.document === document && !document?.aborted ? entry?.value ?? null : null,
    write: value => { if (!document?.aborted) setEntry({ document, value: structuredClone(value) }) } }
}
