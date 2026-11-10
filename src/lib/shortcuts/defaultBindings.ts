import type { ShortcutDefinition } from './ShortcutDefinition'

export const defaultBindings: ShortcutDefinition[] = [
  // ── Global ──────────────────────────────────────────────────────────────
  { id: 'global.undo',   label: 'Undo',   contexts: ['global'], binding: { type: 'keyboard', key: 'z', meta: true } },
  { id: 'global.redo',   label: 'Redo',   contexts: ['global'], binding: { type: 'keyboard', key: 'z', meta: true, shift: true } },
  { id: 'global.help',   label: 'Keyboard Shortcuts', contexts: ['global'], binding: { type: 'keyboard', key: '/', meta: true } },

  // ── Canvas — tools ───────────────────────────────────────────────────────
  { id: 'canvas.tool.select',           label: 'Select Tool',        contexts: ['canvas'], binding: { type: 'keyboard', key: 'v' } },
  { id: 'canvas.tool.pan',              label: 'Pan Tool',           contexts: ['canvas'], binding: { type: 'keyboard', key: 'h' } },
  { id: 'canvas.tool.pen',              label: 'Pen Tool',           contexts: ['canvas'], binding: { type: 'keyboard', key: 'p' } },
  { id: 'canvas.tool.move',             label: 'Move Tool',          contexts: ['canvas'], binding: { type: 'keyboard', key: 'g' } },
  { id: 'canvas.tool.rotate',           label: 'Rotate Tool',        contexts: ['canvas'], binding: { type: 'keyboard', key: 'r' } },
  { id: 'canvas.tool.scale',            label: 'Scale Tool',         contexts: ['canvas'], binding: { type: 'keyboard', key: 's' } },
  { id: 'canvas.tool.anchor',           label: 'Anchor Tool',        contexts: ['canvas'], binding: { type: 'keyboard', key: 'a' } },
  { id: 'canvas.tool.box-select',       label: 'Box Select',         contexts: ['canvas'], binding: { type: 'keyboard', key: 'b' } },
  { id: 'canvas.tool.lasso-select',     label: 'Lasso Select',       contexts: ['canvas'], binding: { type: 'keyboard', key: 'l' } },
  { id: 'canvas.tool.circle-select',    label: 'Circle Select',      contexts: ['canvas'], binding: { type: 'keyboard', key: 'o' } },
  { id: 'canvas.tool.paint-select',     label: 'Paint Select',       contexts: ['canvas'], binding: { type: 'keyboard', key: 'w' } },

  // Canvas movement takes precedence over the global timeline frame shortcuts.
  { id: 'canvas.nudge.left',    label: 'Move Selected Left 1 px',   contexts: ['canvas'], binding: { type: 'keyboard', key: 'arrowleft' } },
  { id: 'canvas.nudge.right',   label: 'Move Selected Right 1 px',  contexts: ['canvas'], binding: { type: 'keyboard', key: 'arrowright' } },
  { id: 'canvas.nudge.up',      label: 'Move Selected Up 1 px',     contexts: ['canvas'], binding: { type: 'keyboard', key: 'arrowup' } },
  { id: 'canvas.nudge.down',    label: 'Move Selected Down 1 px',   contexts: ['canvas'], binding: { type: 'keyboard', key: 'arrowdown' } },
  { id: 'canvas.nudge.left10',  label: 'Move Selected Left 10 px',  contexts: ['canvas'], binding: { type: 'keyboard', key: 'arrowleft', shift: true } },
  { id: 'canvas.nudge.right10', label: 'Move Selected Right 10 px', contexts: ['canvas'], binding: { type: 'keyboard', key: 'arrowright', shift: true } },
  { id: 'canvas.nudge.up10',    label: 'Move Selected Up 10 px',    contexts: ['canvas'], binding: { type: 'keyboard', key: 'arrowup', shift: true } },
  { id: 'canvas.nudge.down10',  label: 'Move Selected Down 10 px',  contexts: ['canvas'], binding: { type: 'keyboard', key: 'arrowdown', shift: true } },

  // ── Selection / deletion (works in any context — handler is context-aware) ─
  { id: 'global.delete',            label: 'Delete Selected',    contexts: ['global'], binding: { type: 'keyboard', key: 'delete' } },
  { id: 'global.deleteBackspace',   label: 'Delete Selected',    contexts: ['global'], binding: { type: 'keyboard', key: 'backspace' } },

  // ── Canvas — selection ───────────────────────────────────────────────────
  { id: 'canvas.select.duplicate',  label: 'Duplicate Layer',    contexts: ['canvas'], binding: { type: 'keyboard', key: 'd', meta: true } },
  { id: 'canvas.select.cloneQuick', label: 'Clone Quick',        contexts: ['canvas'], binding: { type: 'keyboard', key: 'd', meta: true, alt: true }, description: 'Clone with animation tracks copied' },
  { id: 'canvas.select.copy',       label: 'Copy Keyframes',     contexts: ['canvas', 'timeline'], binding: { type: 'keyboard', key: 'c', meta: true } },
  { id: 'canvas.select.paste',      label: 'Paste Keyframes',    contexts: ['canvas', 'timeline'], binding: { type: 'keyboard', key: 'v', meta: true } },
  { id: 'canvas.select.group',      label: 'Group',              contexts: ['canvas'], binding: { type: 'keyboard', key: 'g', meta: true } },
  { id: 'canvas.select.ungroup',    label: 'Ungroup',            contexts: ['canvas'], binding: { type: 'keyboard', key: 'g', meta: true, shift: true } },
  { id: 'canvas.select.array',      label: 'Open Array Dialog',  contexts: ['canvas'], binding: { type: 'keyboard', key: 'a', meta: true, shift: true } },

  // ── Canvas — align ───────────────────────────────────────────────────────
  { id: 'canvas.align.left',             label: 'Align Left',              contexts: ['canvas'], binding: { type: 'keyboard', key: 'a', alt: true }, description: 'Align selected layers to left edge' },
  { id: 'canvas.align.right',            label: 'Align Right',             contexts: ['canvas'], binding: { type: 'keyboard', key: 'd', alt: true } },
  { id: 'canvas.align.top',              label: 'Align Top',               contexts: ['canvas'], binding: { type: 'keyboard', key: 'w', alt: true } },
  { id: 'canvas.align.bottom',           label: 'Align Bottom',            contexts: ['canvas'], binding: { type: 'keyboard', key: 's', alt: true } },
  { id: 'canvas.align.centerH',          label: 'Align Horizontal Center', contexts: ['canvas'], binding: { type: 'keyboard', key: 'h', alt: true } },
  { id: 'canvas.align.centerV',          label: 'Align Vertical Center',   contexts: ['canvas'], binding: { type: 'keyboard', key: 'v', alt: true } },
  { id: 'canvas.distribute.horizontal',  label: 'Distribute Horizontal',   contexts: ['canvas'], binding: { type: 'keyboard', key: 'h', meta: true, alt: true } },
  { id: 'canvas.distribute.vertical',    label: 'Distribute Vertical',     contexts: ['canvas'], binding: { type: 'keyboard', key: 'v', meta: true, alt: true } },

  // ── Canvas — gestures ────────────────────────────────────────────────────
  { id: 'canvas.gesture.cloneDrag',    label: 'Clone while dragging',          contexts: ['canvas'], binding: { type: 'gesture', gesture: 'drag', modifiers: ['meta'] }, description: 'Cmd/Ctrl + drag copies the complete selected subtree and animation' },
  { id: 'canvas.gesture.cloneDragAlt', label: 'Copy while dragging (Alt)', contexts: ['canvas'], binding: { type: 'gesture', gesture: 'drag', modifiers: ['alt'] }, description: 'Hold Alt before mouse-down, drag, then release the mouse to copy; Alt may remain held' },
  { id: 'canvas.gesture.instanceDrag', label: 'Instance clone while dragging', contexts: ['canvas'], binding: { type: 'gesture', gesture: 'drag', modifiers: ['meta', 'shift'] }, description: 'Cmd/Ctrl + Shift + drag creates linked appearance with independent animation' },

  // ── Playback ─────────────────────────────────────────────────────────────
  { id: 'global.playback.toggle',        label: 'Play / Pause',           contexts: ['global'],   binding: { type: 'keyboard', key: ' ' } },
  { id: 'global.playback.stepBack',      label: 'Step Back 1 Frame',      contexts: ['global'],   binding: { type: 'keyboard', key: 'arrowleft' } },
  { id: 'global.playback.stepForward',   label: 'Step Forward 1 Frame',   contexts: ['global'],   binding: { type: 'keyboard', key: 'arrowright' } },
  { id: 'global.playback.stepBack10',    label: 'Step Back 10 Frames',    contexts: ['global'],   binding: { type: 'keyboard', key: 'arrowleft', shift: true } },
  { id: 'global.playback.stepForward10', label: 'Step Forward 10 Frames', contexts: ['global'],   binding: { type: 'keyboard', key: 'arrowright', shift: true } },

  // ── Timeline — property shortcuts (After Effects-style) ─────────────────
  { id: 'timeline.property.position', label: 'Show Position Track',  contexts: ['timeline'], binding: { type: 'keyboard', key: 'p' }, description: 'Toggle Position track visibility for selected layer' },
  { id: 'timeline.property.scale',    label: 'Show Scale Track',     contexts: ['timeline'], binding: { type: 'keyboard', key: 's' } },
  { id: 'timeline.property.rotation', label: 'Show Rotation Track',  contexts: ['timeline'], binding: { type: 'keyboard', key: 'r' } },
  { id: 'timeline.property.opacity',  label: 'Show Opacity Track',   contexts: ['timeline'], binding: { type: 'keyboard', key: 't' } },
  { id: 'timeline.property.all',      label: 'Show Animated Properties', contexts: ['timeline'], binding: { type: 'keyboard', key: 'u' }, description: 'Show only properties that have keyframes' },

  { id: 'timeline.keyframe.position', label: 'Add/Remove Position Keyframe', contexts: ['timeline'], binding: { type: 'keyboard', key: 'p', alt: true } },
  { id: 'timeline.keyframe.scale',    label: 'Add/Remove Scale Keyframe',    contexts: ['timeline'], binding: { type: 'keyboard', key: 's', alt: true } },
  { id: 'timeline.keyframe.rotation', label: 'Add/Remove Rotation Keyframe', contexts: ['timeline'], binding: { type: 'keyboard', key: 'r', alt: true } },
  { id: 'timeline.keyframe.opacity',  label: 'Add/Remove Opacity Keyframe',  contexts: ['timeline'], binding: { type: 'keyboard', key: 't', alt: true } },

  // ── Timeline — navigation ────────────────────────────────────────────────
  { id: 'timeline.nav.prevKeyframe', label: 'Previous Keyframe', contexts: ['timeline'], binding: { type: 'keyboard', key: ',' } },
  { id: 'timeline.nav.nextKeyframe', label: 'Next Keyframe',     contexts: ['timeline'], binding: { type: 'keyboard', key: '.' } },
  { id: 'timeline.keyframe.set', label: 'Set Key', contexts: ['timeline', 'canvas'], binding: { type: 'keyboard', key: 'k' }, description: 'Set the active keyset for all selected layers in one undo' },
  { id: 'timeline.nav.prevKeyframeLegacy', label: 'Previous Keyframe (legacy J)', contexts: ['timeline'], binding: { type: 'keyboard', key: 'j' } },
  { id: 'timeline.nav.start', label: 'Timeline Start', contexts: ['timeline'], binding: { type: 'keyboard', key: 'home' } },
  { id: 'timeline.nav.end', label: 'Timeline End', contexts: ['timeline'], binding: { type: 'keyboard', key: 'end' } },
  { id: 'timeline.nav.firstKey', label: 'First Keyframe', contexts: ['timeline'], binding: { type: 'keyboard', key: 'home', shift: true } },
  { id: 'timeline.nav.lastKey', label: 'Last Keyframe', contexts: ['timeline'], binding: { type: 'keyboard', key: 'end', shift: true } },
  { id: 'timeline.marker.previous', label: 'Previous Marker', contexts: ['timeline'], binding: { type: 'keyboard', key: '[' } },
  { id: 'timeline.marker.next', label: 'Next Marker', contexts: ['timeline'], binding: { type: 'keyboard', key: ']' } },
  { id: 'timeline.bookmark.save', label: 'Save Timeline Bookmark', contexts: ['timeline'], binding: { type: 'keyboard', key: 'b', meta: true } },
  ...Array.from({ length: 9 }, (_, i) => ({ id: `timeline.bookmark.${i + 1}`, label: `Timeline Bookmark ${i + 1}`, contexts: ['timeline'] as import('./ShortcutDefinition').ShortcutContext[], binding: { type: 'keyboard' as const, key: String(i + 1), meta: true } })),
]
