import { assetSourcePool } from '../../asset/sources'
import { browserVisualDecoder } from '../../asset/visual/browserVisualDecoder'
import { checkImportExecution, type ImportExecution } from '../resources/ImportExecution'
import type { GifMetadata } from './types'

/** Reuse the existing native visual adapter with a temporary original source.
 * Caller admits the validated pixel/input policy first. Abort requests native
 * source reset while Image.decode actual settlement remains owned; disposing
 * clears src before source release. Readiness
 * deadline/disposal is a browser-handle boundary, not a native RAM/GC promise. */
export async function browserGifStaticProbe(file: File, metadata: GifMetadata, execution?: ImportExecution): Promise<void> {
  checkImportExecution(execution)
  const source = assetSourcePool.create(file)
  let resource: ReturnType<typeof browserVisualDecoder> | undefined
  try {
    resource = browserVisualDecoder({ kind: 'image', url: source.url }, execution?.signal ?? new AbortController().signal)
    await resource.ready; checkImportExecution(execution)
    if (resource.width !== metadata.width || resource.height !== metadata.height) throw new Error('GIF image dimensions differ from validated metadata.')
  } finally { try { resource?.dispose() } finally { source.release() } }
}
