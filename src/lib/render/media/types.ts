import type { Asset } from '../../types'
import type { prepareRenderFrame } from '../prepareRenderFrame'
import type { PathBounds } from '../../geometry/computePathBounds'
export type PreparedRenderFrame = ReturnType<typeof prepareRenderFrame>
/** Borrowed synchronous frame inputs. Area/padding use backing pixels, time ms;
 * caller matrix maps composition to backing space. No scene/DOM is persisted. */
export interface MediaFrameInput {
  frame: PreparedRenderFrame; context: CanvasRenderingContext2D
  area?: PathBounds; padding?: number; prefetchMs?: number; selected?: ReadonlySet<string>
  /** Explicit renderSingleLayer/ghost roots bypass standalone root filtering. */
  rootIds?: readonly string[]
}
export interface VisualDemand { key: string; asset: Asset; layerId?: string; required: boolean }
export interface MediaFrameBridge {
  /** Synchronous demand diff; completion asynchronously invalidates the host. */
  request(input: MediaFrameInput, mode?: 'replace' | 'extend'): void
  /** Detached numeric/readiness data; reading never starts preparation. */
  snapshot(): { loading: readonly string[]; errors: Readonly<Record<string, string>> }
}
