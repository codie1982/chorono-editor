import type { Layer } from '@/lib/types'
import type { SplinePathData } from '@/lib/types/spline'
import { newSplineLayerFromData } from '@/lib/defaults'

/**
 * Convert a detached offset/outline result into a sibling layer. The new
 * layer shares the source's parent/local transform and visible appearance,
 * but gets a fresh ID and no source animation, instance or runtime handles.
 * Closed outlines receive the factory's filled style; open offsets are stroke
 * only. This is the common adapter used by UI and script authoring.
 */
export function modeledSplineLayer(source: Layer, data: SplinePathData, mode: 'offset' | 'outline'): Layer {
  const first = Object.values(data.contours)[0]
  const openPath = mode === 'offset' && !first?.closed
  const created = newSplineLayerFromData(data, { name: `${source.name} ${mode === 'outline' ? 'Outline' : 'Offset'}`, openPath })
  return { ...created, parentId: source.parentId, transform: { ...source.transform }, opacity: source.opacity,
    style: mode === 'offset' ? source.style ?? created.style : created.style }
}
