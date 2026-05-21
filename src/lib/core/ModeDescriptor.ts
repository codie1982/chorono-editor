// ── ModeDescriptor ────────────────────────────────────────────────────────────
// Describes a complete editor mode: its identity, default scene factory, and
// the runtime components (renderer, exporter, property groups) it provides.
//
// Each mode registers exactly one ModeDescriptor with ModeRegistry.
// The editor reads from the active descriptor to populate panels, tools, and
// rendering — instead of hardcoding 2D animation assumptions everywhere.

import type { EditorMode } from './EditorMode'
import type { IScene } from './IScene'
import type { IRenderer } from './IRenderer'
import type { IExporter } from './IExporter'
import type { ISceneObject } from './ISceneObject'

// ── Property group types (re-used from existing PropertySchema system) ────────
import type { PropertyGroup } from '@/lib/registry/PropertySchema'

// ── Tool group (minimal, extended per mode) ───────────────────────────────────
export interface ModeToolGroup {
  id: string
  label: string
  tools: ModeTool[]
}

export interface ModeTool {
  id: string
  label: string
  shortcut?: string
  icon?: string
}

// ── ModeDescriptor ────────────────────────────────────────────────────────────
export interface ModeDescriptor {
  /** Unique mode identifier — matches EditorMode union. */
  mode: EditorMode
  /** Human-readable name shown in mode selector UI. */
  label: string
  /** Icon key or emoji for toolbar/tab display. */
  icon: string

  // ── Factory ───────────────────────────────────────────────────────────────
  /** Create a blank scene for this mode. */
  createDefaultScene(): IScene

  // ── Runtime components ────────────────────────────────────────────────────
  /** Instantiate the renderer for this mode. */
  createRenderer(): IRenderer
  /** All exporters this mode supports (e.g. GIF + HTML for 2D anim). */
  createExporters(): IExporter[]

  // ── UI ────────────────────────────────────────────────────────────────────
  /**
   * Return property groups for the given scene object.
   * The PropertiesPanel renders these generically — the mode decides content.
   */
  getPropertyGroups(obj: ISceneObject): PropertyGroup[]

  /**
   * Panel ids that should be available in this mode.
   * Controls which tabs appear in the dock layout.
   */
  getPanelIds(): string[]

  /** Tool groups shown in the top toolbar for this mode. */
  getToolGroups(): ModeToolGroup[]
}
