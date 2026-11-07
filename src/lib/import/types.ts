// ── Universal Import Pipeline — Core Types ────────────────────────────────────
//
// ImportResult v2: supports both single-output (asset imports) and
// multi-output (document imports — SVG, Lottie, DXF, AE, etc.)
//
// Architecture:
//   ImportSource → ImportManager → AssetImporter | DocumentImporter
//   → Handler → Normalize → ImportResult → ImportTransaction → Scene

import type { Asset }          from '../asset/types'
import type { Layer }          from '../types/core'
import type { Timeline, Track } from '../types/core'
import type { EditorCommand }  from '../editor/commands-keyframe'

// ── Format Detection ──────────────────────────────────────────────────────────

export type ImportFormat =
  // Asset formats (single output)
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/avif'
  | 'image/gif'
  | 'video/mp4'
  | 'video/mov'
  | 'video/webm'
  | 'audio/mp3'
  | 'audio/wav'
  | 'audio/aac'
  | 'audio/ogg'
  | 'font/woff'
  | 'font/woff2'
  | 'font/ttf'
  | 'font/otf'
  // Document formats (multi output)
  | 'image/svg+xml'
  | 'application/lottie+json'
  | 'application/dotlottie'
  | 'application/chorono+json'
  | 'application/ae-package'
  | 'application/dxf'
  | 'application/dwg'
  | 'application/pdf'
  | 'application/figma'
  | 'application/psd'
  | 'image/spritesheet'
  | 'unknown'

/** Whether a format creates a single asset/layer or a full document structure */
export type ImportKind = 'asset' | 'document'

export function getImportKind(format: ImportFormat): ImportKind {
  const assetFormats: ImportFormat[] = [
    'image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif',
    'image/spritesheet',  // single output (1 sprite asset + 1 frameSequence layer)
    'video/mp4', 'video/mov', 'video/webm',
    'audio/mp3', 'audio/wav', 'audio/aac', 'audio/ogg',
    'font/woff', 'font/woff2', 'font/ttf', 'font/otf',
  ]
  return assetFormats.includes(format) ? 'asset' : 'document'
}

// ── Import Source ─────────────────────────────────────────────────────────────

export type ImportSourceKind = 'file' | 'url' | 'clipboard' | 'package' | 'drag'

export interface ImportSource {
  kind: ImportSourceKind
  /** Original filename or URL */
  value: string
  /** File size in bytes */
  size?: number
  /** MIME type as reported by browser */
  mimeType?: string
  /** Timestamp of import */
  timestamp: number
}

// ── Import Options ────────────────────────────────────────────────────────────

/** Universal options, applicable to all formats */
export interface BaseImportOptions {
  /** Audio clip placement captured when the import starts. */
  timelineId?: string
  startMs?: number
  /** Target asset collection id */
  collection?: string
  /** Scale factor applied to imported dimensions */
  scale?: number
  /** Center imported content in composition */
  centerInComposition?: boolean
  /** Run path simplification */
  simplifyPaths?: boolean
  /** Compress imported images */
  compressImages?: boolean
}

/** SVG-specific import options */
export interface SvgImportOptions extends BaseImportOptions {
  preserveGroups?: boolean
  convertTextToPath?: boolean
  flattenGroups?: boolean
  bakeUnsupportedFilters?: boolean
}

/** Lottie-specific import options */
export interface LottieImportOptions extends BaseImportOptions {
  importMode?: 'editable' | 'flattened' | 'hybrid'
  preserveKeyframes?: boolean
  bakeExpressions?: boolean
  importHiddenLayers?: boolean
}

/** CAD (DXF/DWG) specific import options */
export interface CadImportOptions extends BaseImportOptions {
  unit?: 'auto' | 'mm' | 'cm' | 'm' | 'inch'
  coordinateMode?: 'preserve' | 'centerToComp' | 'normalizeToOrigin'
  yAxisMode?: 'cad' | 'screen'
  importLayers?: boolean
  selectedLayers?: string[]
  preserveLayerColors?: boolean
  preserveLineWeights?: boolean
  convertSplinesToBezier?: boolean
  simplifyTolerance?: number
  importText?: boolean
  convertTextToPath?: boolean
  importDimensions?: boolean
  importHatches?: boolean
  importBlocks?: 'preserve' | 'explode' | 'ignore'
}

/** Sprite-sheet import options (grid layout for frame extraction) */
export interface SpriteImportOptions extends BaseImportOptions {
  columns: number
  rows: number
  /** Total frames. Defaults to columns*rows; clamp supports a partial last row. */
  frameCount?: number
  /** Playback rate (fps). Default 12. */
  fps?: number
  loop?: boolean
}

/** After Effects package import options */
export interface AeImportOptions extends BaseImportOptions {
  importMode?: 'editable' | 'flattened' | 'hybrid'
  selectedCompOnly?: boolean
  importPrecomps?: boolean
  preserveLayerNames?: boolean
  preserveParenting?: boolean
  importHiddenLayers?: boolean
  preserveKeyframes?: boolean
  bakeExpressions?: boolean
  expressionBakeFps?: number
  simplifyCurves?: boolean
  importShapeLayers?: boolean
  convertTextToPath?: boolean
  preserveTrimPaths?: boolean
  preserveMasks?: boolean
  bakeUnsupportedEffects?: boolean
  createPlaceholderLayers?: boolean
}

export type ImportOptions =
  | BaseImportOptions
  | SvgImportOptions
  | LottieImportOptions
  | SpriteImportOptions
  | CadImportOptions
  | AeImportOptions

// ── Import Result ─────────────────────────────────────────────────────────────

/** Intermediate group structure from complex imports */
export interface ImportedGroup {
  id: string
  name: string
  parentId?: string
  layerIds: string[]
  /** Source group info (e.g. CAD layer name) */
  sourceLabel?: string
}

/** A single warning during import */
export interface ImportWarning {
  code: ImportWarningCode
  severity: 'info' | 'warning' | 'error'
  message: string
  /** IDs of affected layers or assets */
  affectedIds?: string[]
}

export type ImportWarningCode =
  | 'unsupported_feature'
  | 'unsupported_filter'
  | 'unsupported_blend_mode'
  | 'missing_font'
  | 'large_file'
  | 'too_many_paths'
  | 'too_many_keyframes'
  | 'entity_limit_exceeded'
  | 'expression_baked'
  | 'effect_flattened'
  | 'text_converted'
  | 'color_profile_stripped'
  | 'external_reference_skipped'
  | 'parse_error'
  | 'unknown'

/** An unrecoverable error during import */
export interface ImportError {
  code: string
  message: string
  fatal: boolean
}

/** Feature that couldn't be imported as-is */
export interface UnsupportedFeature {
  feature: string
  description: string
  fallback?: 'skipped' | 'baked' | 'placeholder' | 'warning'
}

/** Summary shown after import completes */
export interface ImportReport {
  title: string
  sourceFileName: string
  format: ImportFormat

  created: {
    assets: number
    layers: number
    groups: number
    tracks: number
    compositions: number
  }

  warnings: ImportWarning[]
  errors: ImportError[]
  unsupportedFeatures: UnsupportedFeature[]
  suggestions: string[]

  /** Duration in ms */
  durationMs: number
}

/** Full result returned by any handler */
export interface ImportResult {
  id: string
  source: ImportSource
  format: ImportFormat
  kind: ImportKind

  // Outputs
  assets: Asset[]
  layers: Layer[]
  groups: ImportedGroup[]
  tracks: Track[]
  timelines: Timeline[]

  // Atomic undo
  commands: EditorCommand[]

  // Reporting
  warnings: ImportWarning[]
  errors: ImportError[]
  unsupportedFeatures: UnsupportedFeature[]
  report: ImportReport
}

// ── Import Preflight ──────────────────────────────────────────────────────────

/** Pre-import analysis shown to user before committing */
export interface ImportPreflight {
  source: ImportSource
  format: ImportFormat
  kind: ImportKind

  summary: {
    estimatedLayers: number
    estimatedAssets: number
    estimatedGroups: number
    estimatedTracks: number
    estimatedMemoryBytes: number
    detectedFeatures: string[]
    unsupportedFeatures: string[]
  }

  /** Options relevant for this format */
  availableOptions: Partial<Record<string, unknown>>
  defaultOptions: ImportOptions
  warnings: string[]
}

// ── Import Transaction ────────────────────────────────────────────────────────

/** Atomic record of everything created by one import — supports undo in one step */
export interface ImportTransaction {
  id: string
  label: string
  format: ImportFormat
  timestamp: number

  createdAssetIds: string[]
  createdLayerIds: string[]
  createdGroupIds: string[]
  createdTrackIds: string[]

  /** Batch command for scene */
  command: EditorCommand
}

// ── Handler Progress ──────────────────────────────────────────────────────────

export type ImportProgressStage =
  | 'reading'
  | 'detecting'
  | 'parsing'
  | 'resolving'
  | 'converting'
  | 'creating'
  | 'complete'
  | 'error'

export interface ImportProgress {
  stage: ImportProgressStage
  label: string
  /** 0–1 */
  progress: number
}

// ── Import Lifecycle Events ─────────────────────────────────────────────────────
//
// Editor-time lifecycle events for the import subsystem. Kept SEPARATE from the
// runtime TriggerEventType (scene playback) on purpose — import is an authoring
// action, not a scene-runtime behaviour. Surfaced via ImportManager.onImportEvent
// so the Console / automation / future tooling can observe imports (per the
// mandatory "every class exposes its events" convention).

export type ImportEventType = 'importStart' | 'importComplete' | 'importError'

export interface ImportEvent {
  type: ImportEventType
  format: ImportFormat
  /** Source name (filename / URL / 'clipboard'). */
  source: string
  /** Present on 'importComplete'. */
  result?: ImportResult
  /** Present on 'importError'. */
  error?: string
}
