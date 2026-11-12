'use client'
import { useEffect } from 'react'
import type { ToolMode } from '@/components/TopToolbar/ToolGroup'
import { shortcutRegistry } from '@/lib/shortcuts'
import type { ShortcutContext } from '@/lib/shortcuts'
import { scopedShortcutAction } from '@/lib/shortcuts/scopedActions'
import type { TimelineNavigation } from '@/lib/timeline/authoring/timelineNavigation'
import { hasVisibleKeyboardScope } from '@/lib/shortcuts/keyboardScope'

/** Timeline property addressed by the P/S/R/T shortcut family. */
export type TimelineProperty = 'position' | 'scale' | 'rotation' | 'opacity'

interface Handlers {
  onUndo: () => void
  onRedo: () => void
  onPlayToggle: () => void
  onStepBack: (frames: number) => void
  onStepForward: (frames: number) => void
  /** Canvas-only composition-pixel movement. Missing legacy hosts keep global
   * Left/Right frame navigation; key repeat invokes one nudge per keydown. */
  onNudgeSelected?: (dx: number, dy: number) => void
  onDeleteSelected: () => void
  onDuplicateSelected: () => void
  onCopy?: () => void
  onPaste?: () => void
  onShowHelp?: () => void
  onGroupSelected?: () => void
  onUngroupSelected?: () => void
  /** BL-59 — Quick Clone with animation copy (Cmd/Ctrl + Alt + D). */
  onCloneQuick?: () => void
  /** BL-59 — Open Array dialog (Cmd/Ctrl + Shift + A). */
  onOpenArrayModal?: () => void
  /** Single-key tool shortcuts (V/M/H/P/G/R/S/A). Pan is a toggle request. No-op if absent. */
  onToolChange?: (mode: ToolMode) => void
  /** Timeline context — reveal a property track (P/S/R/T) or all keyed (U). */
  onTimelineShowProperty?: (prop: TimelineProperty | 'all') => void
  /** Timeline context — add/remove a keyframe for a property at the playhead. */
  onTimelineToggleKeyframe?: (prop: TimelineProperty) => void
  /** Timeline context — jump to previous / next keyframe (J / K). */
  onSetKey?: () => void
  onTimelineNavigate?: (intent: TimelineNavigation, frames?: number) => void
  onTimelinePrevKeyframe?: () => void
  onTimelineNextKeyframe?: () => void
  /** Returns the active editor panel's context. Drives which binding
   *  wins when the same key is mapped in multiple contexts (e.g. S = Scale
   *  tool on the canvas, Show Scale track in the timeline). */
  getContext?: () => ShortcutContext
  /** Drag previews must finish or cancel before another command changes history. */
  isTransactionActive?: () => boolean
  frameRate?: number
}

// Map registry shortcut ids → tool modes for the canvas tool shortcuts.
const TOOL_BY_ID: Record<string, ToolMode> = {
  'canvas.tool.select':         'select',
  'canvas.tool.pan':            'pan',
  'canvas.tool.panLegacy':      'pan',
  'canvas.tool.pen':            'pen',
  'canvas.tool.move':           'move',
  'canvas.tool.rotate':         'rotate',
  'canvas.tool.scale':          'scale',
  'canvas.tool.anchor':         'anchor',
  'canvas.tool.box-select':     'selection-box',
  'canvas.tool.lasso-select':   'selection-lasso',
  'canvas.tool.circle-select':  'selection-circle',
  'canvas.tool.paint-select':   'selection-paint',
}

/**
 * Global keyboard shortcuts for the editor — driven by the central
 * ShortcutRegistry. On every keydown we resolve the (key + modifiers +
 * active context) to a shortcut id, then dispatch the matching handler.
 *
 * Context-awareness means the same physical key can do different things
 * depending on the active panel: `S` is the Scale tool on the canvas
 * but "Show Scale track" in the timeline.
 */
export function useKeyboard(handlers: Handlers) {
  const {
    onUndo, onRedo, onPlayToggle,
    onStepBack, onStepForward,
    onNudgeSelected,
    onDeleteSelected, onDuplicateSelected,
    onCopy, onPaste, onShowHelp,
    onGroupSelected, onUngroupSelected,
    onCloneQuick, onOpenArrayModal,
    onToolChange,
    onTimelineShowProperty, onTimelineToggleKeyframe,
    onTimelinePrevKeyframe, onTimelineNextKeyframe, onSetKey, onTimelineNavigate,
    getContext,
    isTransactionActive,
    frameRate: _frameRate = 60,
  } = handlers

  useEffect(() => {
    // Build the id → action map fresh each effect run so it closes over the
    // latest handlers. Missing handlers leave the slot undefined (no-op).
    const actions: Record<string, (() => void) | undefined> = {
      'global.undo': onUndo,
      'global.redo': onRedo,
      'global.help': onShowHelp,
      'global.delete': onDeleteSelected,
      'global.deleteBackspace': onDeleteSelected,
      'global.playback.toggle': onPlayToggle,
      'global.playback.stepBack':      () => onStepBack(1),
      'global.playback.stepForward':   () => onStepForward(1),
      'global.playback.stepBack10':    () => onStepBack(10),
      'global.playback.stepForward10': () => onStepForward(10),
      'canvas.nudge.left':    onNudgeSelected ? () => onNudgeSelected(-1, 0) : undefined,
      'canvas.nudge.right':   onNudgeSelected ? () => onNudgeSelected(1, 0) : undefined,
      'canvas.nudge.up':      onNudgeSelected ? () => onNudgeSelected(0, -1) : undefined,
      'canvas.nudge.down':    onNudgeSelected ? () => onNudgeSelected(0, 1) : undefined,
      'canvas.nudge.left10':  onNudgeSelected ? () => onNudgeSelected(-10, 0) : undefined,
      'canvas.nudge.right10': onNudgeSelected ? () => onNudgeSelected(10, 0) : undefined,
      'canvas.nudge.up10':    onNudgeSelected ? () => onNudgeSelected(0, -10) : undefined,
      'canvas.nudge.down10':  onNudgeSelected ? () => onNudgeSelected(0, 10) : undefined,

      'canvas.select.duplicate':  onDuplicateSelected,
      'canvas.select.cloneQuick': onCloneQuick,
      'canvas.select.copy':       onCopy,
      'canvas.select.paste':      onPaste,
      'canvas.select.group':      onGroupSelected,
      'canvas.select.ungroup':    onUngroupSelected,
      'canvas.select.array':      onOpenArrayModal,

      'timeline.property.position': () => onTimelineShowProperty?.('position'),
      'timeline.property.scale':    () => onTimelineShowProperty?.('scale'),
      'timeline.property.rotation': () => onTimelineShowProperty?.('rotation'),
      'timeline.property.opacity':  () => onTimelineShowProperty?.('opacity'),
      'timeline.property.all':      () => onTimelineShowProperty?.('all'),
      'timeline.keyframe.position': () => onTimelineToggleKeyframe?.('position'),
      'timeline.keyframe.scale':    () => onTimelineToggleKeyframe?.('scale'),
      'timeline.keyframe.rotation': () => onTimelineToggleKeyframe?.('rotation'),
      'timeline.keyframe.opacity':  () => onTimelineToggleKeyframe?.('opacity'),
      'timeline.keyframe.set': onSetKey,
      'timeline.nav.prevKeyframeLegacy': onTimelineNavigate ? () => onTimelineNavigate('previousKey') : onTimelinePrevKeyframe,
      'timeline.nav.start': onTimelineNavigate ? () => onTimelineNavigate('start') : undefined,
      'timeline.nav.end': onTimelineNavigate ? () => onTimelineNavigate('end') : undefined,
      'timeline.nav.firstKey': onTimelineNavigate ? () => onTimelineNavigate('firstKey') : undefined,
      'timeline.nav.lastKey': onTimelineNavigate ? () => onTimelineNavigate('lastKey') : undefined,
      'timeline.nav.prevKeyframe': onTimelineNavigate ? () => onTimelineNavigate('previousKey') : onTimelinePrevKeyframe,
      'timeline.nav.nextKeyframe': onTimelineNavigate ? () => onTimelineNavigate('nextKey') : onTimelineNextKeyframe,
    }
    // Canvas tool shortcuts → onToolChange.
    for (const [id, mode] of Object.entries(TOOL_BY_ID)) {
      actions[id] = onToolChange ? () => onToolChange(mode) : undefined
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      // Native form controls, IME and inner widgets own their keyboard input.
      if (e.defaultPrevented || e.isComposing || !target
          || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
          || target.closest?.('[role="menu"], [role="dialog"], [aria-modal="true"], dialog')) {
        return
      }

      const context: ShortcutContext = getContext?.() ?? 'canvas'
      let id = shortcutRegistry.resolve(e, context)
      if (id?.startsWith('canvas.nudge.') && !onNudgeSelected) id = shortcutRegistry.resolve(e, 'global')
      if (!id) return
      // A menu/dialog may own focus through a portal while a canvas node is
      // still the event target. Do not move source objects behind that scope.
      if (hasVisibleKeyboardScope()) return
      // Native focused buttons own Space/Enter activation (for example Play).
      if (target.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return
      const frameDirection = id.startsWith('global.playback.stepBack') ? 'previousFrame' : 'nextFrame'
      const action = context === 'timeline' && id.startsWith('global.playback.step') && onTimelineNavigate
        ? () => onTimelineNavigate(frameDirection, id.endsWith('10') ? 10 : 1)
        : actions[id] ?? scopedShortcutAction(id)
      if (!action) return
      e.preventDefault()
      // Holding a toggle key must not alternate tools on native key repeat.
      if (e.repeat && id === 'timeline.keyframe.set') return
      if (e.repeat && (id === 'canvas.tool.pan' || id === 'canvas.tool.panLegacy')) return
      if (isTransactionActive?.()) return
      action()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    onUndo, onRedo, onPlayToggle,
    onStepBack, onStepForward,
    onNudgeSelected,
    onDeleteSelected, onDuplicateSelected,
    onCopy, onPaste, onShowHelp,
    onGroupSelected, onUngroupSelected,
    onCloneQuick, onOpenArrayModal,
    onToolChange,
    onTimelineShowProperty, onTimelineToggleKeyframe,
    onTimelinePrevKeyframe, onTimelineNextKeyframe, onSetKey, onTimelineNavigate,
    getContext,
    isTransactionActive,
  ])
}
