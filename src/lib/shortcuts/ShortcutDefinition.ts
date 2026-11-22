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
  | 'model3d'

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
  gesture: 'drag' | 'scroll' | 'pinch' | 'rotate'
  modifiers?: ('shift' | 'alt' | 'meta' | 'ctrl')[]
  /** Pointer button for a drag gesture; omitted for button-independent gestures. */
  button?: 'left' | 'middle' | 'right'
  /** Finger count shown for a desktop trackpad gesture. */
  fingers?: 1 | 2
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
