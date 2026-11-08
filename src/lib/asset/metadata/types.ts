import type { VisualDecoder } from '../visual/types'
import type { ImageMetadataSource } from './ImageMetadataReader'
import type { JobExecutor } from '../../resources/jobs'
import type { ResourceAllocator } from '../../resources/budget'

export interface MediaInfo { readonly width: number; readonly height: number; readonly durationMs: number }
/** One UI preview pin; native element access is valid only before release. */
export interface ImagePreviewLease {
  readonly element: HTMLImageElement
  readonly width: number
  readonly height: number
  release(): void
}
/** Native metadata resource supports explicit reset/dispose. ready tracks that
 * API's actual settlement; codecs/driver internals remain platform-managed. */
export interface NativeMetadataResource {
  readonly ready: Promise<MediaInfo>
  dispose(): void
}
export type MetadataDecoder = (kind: 'video' | 'audio', url: string, signal: AbortSignal) => NativeMetadataResource
export interface MediaProbeOptions {
  budget?: ResourceAllocator
  executor?: JobExecutor
  imageMetadata?: ImageMetadataSource
  imageDecoder?: VisualDecoder
  metadataDecoder?: MetadataDecoder
  timeoutMs?: number
  maxFrameBytes?: number
  maxDimension?: number
}
/** Runtime signal remains separate from serialized import options. */
export interface ProbeExecution { signal?: AbortSignal }
export interface MediaProbeSource {
  image(file: File, execution?: ProbeExecution): Promise<MediaInfo>
  preview(file: File, execution?: ProbeExecution): Promise<ImagePreviewLease>
  video(file: File, execution?: ProbeExecution): Promise<MediaInfo>
  audio(file: File, execution?: ProbeExecution): Promise<MediaInfo>
}
