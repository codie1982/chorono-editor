// ── Animation2DDescriptor ─────────────────────────────────────────────────────
// ModeDescriptor implementation for the '2danimation' mode.
// Wires together the existing factories, renderer, and registry so the editor
// can operate generically through ModeDescriptor instead of hardcoding 2D
// assumptions in page.tsx and panel components.

import type { ModeDescriptor, ModeToolGroup } from '@/lib/core/ModeDescriptor'
import type { IScene } from '@/lib/core/IScene'
import type { IRenderer } from '@/lib/core/IRenderer'
import type { IExporter } from '@/lib/core/IExporter'
import type { ISceneObject } from '@/lib/core/ISceneObject'
import type { PropertyGroup } from '@/lib/registry/PropertySchema'
import { emptyScene } from '@/lib/defaults'
import { CanvasRenderer2D } from '@/lib/render/CanvasRenderer2D'
import { Exporter2DGIF, Exporter2DWebM, Exporter2DHTML } from '@/lib/export/Exporter2D'
import { layerRegistry } from '@/lib/registry'
import type { Layer } from '@/lib/types'

// ── Property groups ───────────────────────────────────────────────────────────

function getPropertyGroups2D(obj: ISceneObject): PropertyGroup[] {
  const layer = obj as Layer
  const def = layerRegistry.findForLayer(layer)
  if (!def?.getPropertyGroups) return []
  return def.getPropertyGroups(layer)
}

// ── Panel ids ─────────────────────────────────────────────────────────────────
// Mirrors the current panelRegistry in page.tsx. ModeDescriptor is the single
// source of truth so future modes can declare their own panel sets.

const PANEL_IDS_2D = [
  'layers',
  'sceneExplorer',
  'canvas',
  'stateMachine',
  'properties',
  'timeline',
  'curveEditor',
  'dopeSheet',
  'curveModifiers',
  'parameters',
  'events',
  'motionBinding',
  'wiring',
  'selection',
  'runtimePreview',
  'assets',
  'snap',
  'particles',
  'scriptConsole',
  'shortcuts',
  'resourceMonitor',
] as const

// ── Tool groups ───────────────────────────────────────────────────────────────

const TOOL_GROUPS_2D: ModeToolGroup[] = [
  {
    id: 'select',
    label: 'Selection',
    tools: [
      { id: 'select',    label: 'Select',    shortcut: 'V' },
      { id: 'pan',       label: 'Pan',       shortcut: 'H' },
    ],
  },
  {
    id: 'transform',
    label: 'Transform',
    tools: [
      { id: 'rotate',    label: 'Rotate',    shortcut: 'R' },
      { id: 'scale',     label: 'Scale',     shortcut: 'S' },
    ],
  },
  {
    id: 'draw',
    label: 'Draw',
    tools: [
      { id: 'pen',       label: 'Pen',       shortcut: 'P' },
      { id: 'text',      label: 'Text',      shortcut: 'T' },
    ],
  },
]

// ── Descriptor ────────────────────────────────────────────────────────────────

export const Animation2DDescriptor: ModeDescriptor = {
  mode: '2danimation',
  label: '2D Animation',
  icon: '🎬',

  createDefaultScene(): IScene {
    const scene = emptyScene()
    return {
      ...scene,
      // IScene shape: objects[] mirrors layers[]
      objects: scene.layers,
      timelines: scene.timelines,
    } as unknown as IScene
  },

  createRenderer(): IRenderer {
    return new CanvasRenderer2D()
  },

  createExporters(): IExporter[] {
    return [
      new Exporter2DGIF(),
      new Exporter2DWebM(),
      new Exporter2DHTML(),
    ]
  },

  getPropertyGroups: getPropertyGroups2D,

  getPanelIds(): string[] {
    return [...PANEL_IDS_2D]
  },

  getToolGroups(): ModeToolGroup[] {
    return TOOL_GROUPS_2D
  },
}
