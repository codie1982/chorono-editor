// ── Core abstractions ─────────────────────────────────────────────────────────
// Mode-agnostic interfaces shared by all editor modes.
// Import from '@/lib/core' rather than individual files.

export type { EditorMode } from './EditorMode'
export type { ISceneObject } from './ISceneObject'
export { isSceneObject2D } from './ISceneObject'
export type { PropertyPath, PropertyValue, ITimeline } from './ITimeline'
export type { IScene } from './IScene'
export type { RenderContext, IRenderer } from './IRenderer'
export type { IPlaybackController } from './IPlaybackController'
export type { ExportOptions, ExportResult, IExporter } from './IExporter'
export type { ModeToolGroup, ModeTool, ModeDescriptor } from './ModeDescriptor'
