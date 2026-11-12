'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChronoScene } from '@/lib/types'
import { projectIsolationView } from '@/lib/scene/visibility/isolationView'

/** Own a temporary editor isolation scope, independent of selection changes
 * and command history. The live source is reprojected after every committed
 * edit, so new children join the scope and edits survive Exit/undo. Document
 * replacement clears the scope; deleted roots cannot leave a blank isolation.
 * No source flags, history entries, timers or persistent preferences are owned.
 */
export function useLayerIsolation(scene: ChronoScene, documentSignal: AbortSignal) {
  const [rootIds, setRootIds] = useState<readonly string[]>([])
  const projection = useMemo(() => projectIsolationView(scene, rootIds), [scene, rootIds])
  useEffect(() => { setRootIds([]) }, [documentSignal])
  const enter = useCallback((ids: readonly string[]) => {
    const visual = new Set(scene.layers.filter(layer => layer.type !== 'audio').map(layer => layer.id))
    setRootIds(Array.from(new Set(ids)).filter(id => visual.has(id)))
  }, [scene.layers])
  const exit = useCallback(() => setRootIds([]), [])
  return { ...projection, active: projection.roots.length > 0, enter, exit }
}
