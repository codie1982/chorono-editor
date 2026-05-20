export type ShortcutContext =
  | 'global'
  | 'canvas'
  | 'timeline'
  | 'graphEditor'
  | 'splineEdit'
  | 'textEdit'
  | 'layerPanel'
  | 'assetLibrary'
  | 'preview'

export interface KeyBinding {
  type: 'keyboard'
  /** Lowercase key names, e.g. 'z', 'delete', 'arrowleft', ' ' */
  key: string
  meta?: boolean   // Cmd on Mac, Ctrl on Windows/Linux
  ctrl?: boolean   // Ctrl key (separate from meta)
  shift?: boolean
  alt?: boolean
}

export interface GestureBinding {
  type: 'gesture'
  gesture: 'drag' | 'scroll' | 'pinch'
  modifiers?: ('shift' | 'alt' | 'meta' | 'ctrl')[]
}

export type Binding = KeyBinding | GestureBinding

export interface ShortcutDefinition {
  /** Unique dot-namespaced id, e.g. 'canvas.transform.move' */
  id: string
  label: string
  /** Optional longer description shown in the shortcuts panel */
  description?: string
  /** Which contexts this shortcut is active in */
  contexts: ShortcutContext[]
  binding: Binding
}
