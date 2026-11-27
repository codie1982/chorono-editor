import type { ShortcutDefinition } from '../../shortcuts/ShortcutDefinition'
import type { ModelViewPreset } from './viewPresets'
import { MODEL_VIEWPORT_TOOLS } from './viewportTools'

/** Viewport-local keyboard actions. The focused 3D viewport consumes these
 * keys, so identical keys in the 2D editor keep their existing meaning. */
export const MODEL_VIEW_KEY_ACTIONS: Readonly<Record<string, ModelViewPreset | 'frame'>> = {
  f: 'front', t: 'top', l: 'left', b: 'bottom',
  p: 'perspective', u: 'orthographic', z: 'frame',
  i: 'isometric',
}

const keyLabels: Readonly<Record<keyof typeof MODEL_VIEW_KEY_ACTIONS, string>> = {
  f: 'Front view', t: 'Top view', l: 'Left view', b: 'Bottom view',
  p: 'Perspective projection', u: 'Orthographic projection',
  z: 'Frame selection', i: 'Isometric view',
}

/** Reference entries for the Shortcuts panel. Max-style navigation uses
 * middle drag to pan, Alt+middle to orbit and Ctrl+Alt+middle to dolly.
 * Isometric and left/right drag alternatives are Chorono additions. */
export const model3dShortcutDefinitions: ShortcutDefinition[] = [
  { id: 'model3d.selection.all', label: 'Select all visible 3D objects', contexts: ['model3d'], binding: { type: 'keyboard', key: 'a', meta: true } },
  { id: 'model3d.selection.delete', label: 'Delete selected 3D objects', contexts: ['model3d'], binding: { type: 'keyboard', key: 'delete' } },
  { id: 'model3d.selection.deleteBackspace', label: 'Delete selected 3D objects', contexts: ['model3d'], binding: { type: 'keyboard', key: 'backspace' } },
  { id: 'model3d.selection.menu', label: 'Open 3D object menu', contexts: ['model3d'], binding: { type: 'keyboard', key: 'f10', shift: true } },
  { id: 'model3d.nav.pinch', label: 'Trackpad pinch to zoom', contexts: ['model3d'], binding: { type: 'gesture', gesture: 'pinch', fingers: 2 } },
  { id: 'model3d.nav.trackpadRoll', label: 'Trackpad rotate to roll', description: 'Available in Safari; use Shift+right drag in other desktop browsers', contexts: ['model3d'], binding: { type: 'gesture', gesture: 'rotate', fingers: 2 } },
  { id: 'model3d.nav.rollMouse', label: 'Roll view (Chorono)', contexts: ['model3d'], binding: { type: 'gesture', gesture: 'drag', button: 'right', modifiers: ['shift'] } },
  { id: 'model3d.nav.wheelPan', label: 'Pan with wheel', contexts: ['model3d'], binding: { type: 'gesture', gesture: 'scroll', modifiers: ['shift'] } },
  { id: 'model3d.nav.pan', label: 'Pan view', contexts: ['model3d'], binding: { type: 'gesture', gesture: 'drag', button: 'middle' } },
  { id: 'model3d.nav.orbit', label: 'Orbit view', contexts: ['model3d'], binding: { type: 'gesture', gesture: 'drag', button: 'middle', modifiers: ['alt'] } },
  { id: 'model3d.nav.dolly', label: 'Dolly view', contexts: ['model3d'], binding: { type: 'gesture', gesture: 'drag', button: 'middle', modifiers: ['ctrl', 'alt'] } },
  { id: 'model3d.nav.wheel', label: 'Dolly with wheel', contexts: ['model3d'], binding: { type: 'gesture', gesture: 'scroll' } },
  { id: 'model3d.nav.orbitLeft', label: 'Orbit with Orbit tool', contexts: ['model3d'], binding: { type: 'gesture', gesture: 'drag', button: 'left' } },
  { id: 'model3d.nav.panLeft', label: 'Pan with Pan tool', contexts: ['model3d'], binding: { type: 'gesture', gesture: 'drag', button: 'left' } },
  { id: 'model3d.nav.tilt', label: 'Tilt view (Chorono)', contexts: ['model3d'], binding: { type: 'gesture', gesture: 'drag', button: 'right' } },
  { id: 'model3d.nav.tiltAlt', label: 'Tilt view outside Select tool (Chorono)', contexts: ['model3d'], binding: { type: 'gesture', gesture: 'drag', button: 'left', modifiers: ['alt'] } },
  { id: 'model3d.nav.panShift', label: 'Pan outside Select tool (Chorono)', contexts: ['model3d'], binding: { type: 'gesture', gesture: 'drag', button: 'left', modifiers: ['shift'] } },
  ...MODEL_VIEWPORT_TOOLS.map(tool => ({ id: `model3d.tool.${tool.id}`, label: `${tool.label} tool`, contexts: ['model3d'] as ShortcutDefinition['contexts'], binding: { type: 'keyboard' as const, key: tool.key.toLowerCase() } })),
  ...Object.entries(MODEL_VIEW_KEY_ACTIONS).map(([key]) => ({
    id: `model3d.view.${MODEL_VIEW_KEY_ACTIONS[key]}`,
    label: keyLabels[key],
    description: key === 'i' ? 'Chorono view preset' : undefined,
    contexts: ['model3d'] as ShortcutDefinition['contexts'],
    binding: { type: 'keyboard' as const, key },
  })),
]
