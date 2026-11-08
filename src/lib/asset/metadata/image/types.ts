export type ImageHeaderFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'opaque'
/** Coded raster/logical canvas dimensions. Orientation/density presentation may
 * differ; native readiness remains authoritative for display width/height.
 * null dimensions explicitly mean no supported preallocation guarantee. */
export interface ImageHeader {
  readonly format: ImageHeaderFormat
  readonly width: number | null
  readonly height: number | null
  readonly reason?: 'unsupported-format' | 'header-limit' | 'native-dimensions'
}
/** Small bounded-prefix access, not a full codec/container validator. */
export interface HeaderBytes {
  readonly data: Uint8Array
  readonly complete: boolean
}
