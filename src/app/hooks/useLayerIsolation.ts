'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChronoScene } from '@/lib/types'
import { projectIsolationView } from '@/lib/scene/visibility/isolationView'

/** Own a temporary editor isolation scope, independent of selection changes
 * and command history. The live source is reprojected after every committed
 * edit, so new children join the scope and edits survive Exit/undo. Document
 * replacement clears the scope; deleted roots cannot leave a blank isolation.
 * Panel content scope keeps identity across geometry/key previews with unchanged
 * membership, preventing unnecessary UI cancellation. No source flags, history
 * entries, timers or persistent preferences are owned.
 */
export function useLayerIsolation(scene: ChronoScene, documentSignal: AbortSignal) {
  const [rootIds, setRootIds] = useState<readonly string[]>([])
  const projection = useMemo(() => projectIsolationView(scene, rootIds), [scene, rootIds])
  // Geometry/key previews preserve membership. Stable identity keeps transient
  // panel editors open until the actual isolation boundary changes.
  const contentScope = useRef<ReadonlySet<string> | null>(null)
  const nextScope = projection.contentScope, previousScope = contentScope.current
  if (nextScope === null || !previousScope || nextScope.size !== previousScope.size
    || Array.from(nextScope).some(id => !previousScope.has(id))) contentScope.current = nextScope
  useEffect(() => { setRootIds([]) }, [documentSignal])
  const enter = useCallback((ids: readonly string[]) => {
    const visual = new Set(scene.layers.filter(layer => layer.type !== 'audio').map(layer => layer.id))
    setRootIds(Array.from(new Set(ids)).filter(id => visual.has(id)))
  }, [scene.layers])
  const exit = useCallback(() => setRootIds([]), [])
  return { ...projection, contentScope: contentScope.current, active: projection.roots.length > 0, enter, exit }
}
