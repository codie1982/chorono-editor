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
  volume?: number
  muted?: boolean
  startOffsetMs?: number
  loop?: boolean
}

// ── Asset Registry ────────────────────────────────────────────────────────────
// Stored in ChronoScene.assets[]. Runtime JSON references by id.

export type AssetType = 'image' | 'video' | 'audio'

export interface Asset {
  id: string
  name: string
  type: AssetType
  /** blob:// or https:// URL. Revoke blob URLs when removing from scene. */
  url: string
  /** For video / audio only */
  durationMs?: number
  /** For image / video only */
  width?: number
  height?: number
}
