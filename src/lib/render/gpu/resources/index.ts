import { editorResourceBudget, ResourceBudget, ResourceBudgetGroup } from '@/lib/resources/budget'
export { GpuStorageOwner, GpuAdmissionError } from './GpuStorageOwner'
export { buildWebGLProgram } from './buildWebGLProgram'
export { GpuBackendUnavailableError } from './GpuBackendUnavailableError'
export type GLContext = WebGLRenderingContext | WebGL2RenderingContext

/** Shared GPU workspace limit overlaps the editor ledger; never add them. */
export const gpuStorageBudget = new ResourceBudget({ maxBytes: 192 * 1024 ** 2, maxEntries: 64 })
export const gpuStorageAllocator = new ResourceBudgetGroup([gpuStorageBudget, editorResourceBudget])

/** Positive integer backing dimensions, in pixels. This estimates one RGBA8
 * color store only; callers explicitly multiply by their texture/canvas count. */
export function gpuColorBytes(width: number, height: number): number {
  const bytes = width * height * 4
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || !Number.isSafeInteger(bytes)) throw new RangeError('GPU backing dimensions must be positive safe integers.')
  return bytes
}
