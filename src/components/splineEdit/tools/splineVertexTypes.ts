import type { SplineVertexType } from '@/lib/spline/edit/addVertex'
import { splinePointTypes } from './splineEditTools'

/** Shared insertion choices; preserve is a tool preference, never a serialized
 * point type. Existing four point enum values and labels remain authoritative. */
export const splineVertexTypes: readonly { value: SplineVertexType; label: string }[] = [
  { value: 'preserve', label: 'Preserve curve (Default)' }, ...splinePointTypes,
]
