// ── Media Types ───────────────────────────────────────────────────────────────
// Image, Video, Audio data attached to layers + the Asset registry.

// ── Image ─────────────────────────────────────────────────────────────────────

export type ObjectFit = 'fill' | 'contain' | 'cover' | 'none'

export interface ImageData {
  assetId: string
  objectFit?: ObjectFit  // default 'contain'
}

// ── Video ─────────────────────────────────────────────────────────────────────

export interface VideoData {
  assetId: string
  /** 0–1 playback volume. Default 1. */
  volume?: number
  /** Mute without losing volume setting. Default false. */
  muted?: boolean
  /** Trim: offset (ms) into the source file where playback begins. Default 0. */
  startOffsetMs?: number
  /** Loop the video clip. Default false. */
  loop?: boolean
}

// ── Audio ─────────────────────────────────────────────────────────────────────

export interface AudioData {
  assetId: string
  /** Linear gain. 1 = 0 dB; 0 = silence. Supports gain up to 4. */
  volume?: number
  muted?: boolean
  /** Offset into the source file, independent of the clip's timeline start. */
  startOffsetMs?: number
  loop?: boolean
  fadeInMs?: number
  fadeOutMs?: number
  /** Shared fade envelope after a lossless split, in timeline milliseconds. */
  fadeRange?: { startMs: number; endMs: number }
  /** Stereo pan: -1 = left, 0 = centre, 1 = right. */
  pan?: number
  /** Owning timeline. Omitted for legacy clips that play globally. */
  timelineId?: string
}

// ── Frame Sequence (BL-07) ─────────────────────────────────────────────────────
// Sprite-sheet / animated-frame playback. The asset is a single image laid out
// as a grid of frames; the renderer draws one cell per timeline frame.

export interface FrameSequenceData {
  /** Sprite-sheet image asset id. */
  assetId: string
  /** Grid columns / rows in the source sheet. */
  columns: number
  rows: number
  /** Total frames (≤ columns*rows; last row may be partial). */
  frameCount: number
  /** Frame cell size in the source sheet (px). */
  frameWidth: number
  frameHeight: number
  /** Playback rate (frames per second). */
  fps: number
  /** Loop when the sequence ends. Default true. */
  loop?: boolean
  /** How a frame fits the layer size. Default 'contain'. */
  objectFit?: ObjectFit
}

// ── Asset Registry ────────────────────────────────────────────────────────────
// Stored in ChronoScene.assets[]. Runtime JSON references by id.

/**
 * Extended asset types added by the BL-04 universal import pipeline.
 * Legacy code that only uses 'image' | 'video' | 'audio' continues to work
 * because those values are still part of this union.
 */
export type AssetType =
  | 'image'
  | 'video'
  | 'audio'
  | 'font'         // BL-04: FontHandler
  | 'svg'          // BL-04: SvgDocumentHandler
  | 'lottie'       // BL-04: LottieDocumentHandler (Phase 3: full keyframe import)
  | 'spriteSheet'  // BL-07: planned
  | 'gif'          // BL-07: planned

// ── Storage (BL-04) ───────────────────────────────────────────────────────────

export type AssetStorageMode =
  | 'embedded'       // Base64 embedded in the project file
  | 'external'       // References a file path/URL outside the project
  | 'projectPackage' // Bundled inside a .chorono package
  | 'remote'         // Fetched from a remote URL at runtime

export interface AssetStorage {
  mode: AssetStorageMode
  /** For 'external' and 'remote' modes */
  uri?: string
  /** Internal blob ID for embedded data */
  blobId?: string
  /** Original filename at time of import */
  originalFileName?: string
}

// ── Metadata (BL-04) ─────────────────────────────────────────────────────────

export interface AssetMetadata {
  /** File size in bytes at time of import */
  filesize?: number
  /** Unix timestamp of when asset was created/imported */
  importedAt?: number
  /** Source app (e.g. 'figma', 'after-effects', 'blender') */
  sourceApp?: string
  /** User-defined tags */
  tags?: string[]
  /** Free-form notes */
  notes?: string
}

// ── Runtime (not persisted) ───────────────────────────────────────────────────

export interface AssetRuntime {
  /**
   * Blob URL for in-browser display.
   * Created by URL.createObjectURL(), must be revoked when asset is removed.
   * IMPORTANT: NOT stored in scene JSON — stripped by AssetRegistry.serializeAssets().
   */
  objectUrl?: string
  /**
   * Decoded asset (AudioBuffer, HTMLImageElement, etc.)
   * NOT stored in scene JSON.
   */
  decoded?: unknown
}

// ── Asset ─────────────────────────────────────────────────────────────────────

export interface Asset {
  id: string
  name: string
  type: AssetType
  /**
   * Primary URL — blob: for in-browser, https: for remote.
   * For persistence, prefer `storage.uri`.
   * Kept for backward compatibility with existing renderer / hooks.
   */
  url: string

  // ── Dimensions / duration (backward compat) ─────────────────────────────────
  /** For video / audio only */
  durationMs?: number
  /** For image / video only */
  width?: number
  height?: number
  /** Video frame rate */
  frameRate?: number

  // ── BL-04 enhanced fields (all optional) ────────────────────────────────────
  /** Persistent storage info (not blob URLs). Set by import handlers. */
  storage?: AssetStorage
  /** Import provenance and user metadata. */
  metadata?: AssetMetadata
  /**
   * Runtime-only ephemeral data. Stripped before JSON serialization.
   * Use AssetRegistry.serializeAssets() to get a persistence-safe copy.
   */
  runtime?: AssetRuntime
}
