/** Region style is independent of the editor's transform/drawing tool. */
export type SelectionRegionStyle = 'box' | 'lasso' | 'circle' | 'paint'
export type SelectionMode = 'replace' | 'add' | 'subtract'
export type SelectionRegion =
  | { kind: 'box'; x: number; y: number; w: number; h: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'lasso'; points: Array<{ x: number; y: number }> }
  | { kind: 'paint'; cx: number; cy: number; r: number }

/** Compatibility for older callers which encode selection style as a tool.
 * New editor callers keep their tool and region preference independently. */
export function legacySelectionStyle(mode: string | undefined): SelectionRegionStyle | null {
  switch (mode) {
    case 'selection-box': return 'box'
    case 'selection-lasso': return 'lasso'
    case 'selection-circle': return 'circle'
    case 'selection-paint': return 'paint'
    default: return null
  }
}

/** Empty-space drags use the preferred region with any ordinary manipulation
 * tool. Pan, drawing and unknown modes keep exclusive ownership. The host must
 * additionally exclude preview, camera, motion editing and active gestures. */
export function selectionRegionForTool(mode: string | undefined, preferred: SelectionRegionStyle = 'box'): SelectionRegionStyle | null {
  const legacy = legacySelectionStyle(mode)
  if (legacy) return legacy
  return mode === undefined || ['select', 'move', 'rotate', 'scale', 'anchor'].includes(mode) ? preferred : null
}

/** Match existing viewport modifiers: Shift adds, Alt subtracts, otherwise
 * replace. Ctrl/Cmd also add when starting on empty space; object clone/chord
 * routing is handled separately before this function is used. */
export function selectionModeForModifiers(event: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): SelectionMode {
  return event.shiftKey ? 'add' : event.altKey ? 'subtract' : event.ctrlKey || event.metaKey ? 'add' : 'replace'
}
