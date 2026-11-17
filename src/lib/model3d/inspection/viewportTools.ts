/** View-local 3D modes. Their shortcuts are scoped to the focused model
 * viewport; identical 2D keys keep their existing canvas behavior. */
export type ModelViewportTool = 'select' | 'move' | 'rotate' | 'scale' | 'pan' | 'orbit'

export const MODEL_VIEWPORT_TOOLS: readonly { id: ModelViewportTool; label: string; key: string }[] = [
  { id: 'select', label: 'Select', key: 'V' },
  { id: 'move', label: 'Move', key: 'G' },
  { id: 'rotate', label: 'Rotate', key: 'R' },
  { id: 'scale', label: 'Scale', key: 'S' },
  { id: 'pan', label: 'Pan', key: 'H' },
  { id: 'orbit', label: 'Orbit', key: 'O' },
]

/** Case-insensitive lookup for unmodified keys after text inputs are excluded. */
export function modelViewportToolForKey(key: string): ModelViewportTool | undefined {
  return MODEL_VIEWPORT_TOOLS.find(tool => tool.key.toLowerCase() === key.toLowerCase())?.id
}
