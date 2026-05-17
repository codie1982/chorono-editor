// ── Shared keyframe / track menu item builders ─────────────────────────────
// Both Curve Editor and Dope Sheet show right-click menus on keyframes and
// tracks. Most rows are identical (interpolation submenu, copy/cut/delete,
// align-to-frame, …). Keeping the menu structure here avoids drift between
// the two surfaces and makes "what can the user do to a keyframe?" a
// single-source question.

import type { Keyframe, EasingType, TangentMode } from '@/lib/types'
import type { MenuItem } from '@/components/ui/ContextMenu'

const EASING_TYPES: EasingType[] = [
  'linear', 'hold', 'easeIn', 'easeOut', 'easeInOut', 'customBezier',
]

export interface KeyframeMenuHandlers {
  /** Inline-edit value (opens a small input on the kf node). */
  editValue?:     (kf: Keyframe) => void
  /** Inline-edit time. */
  editTime?:      (kf: Keyframe) => void
  /** Switch easing type. */
  setEasing?:     (kf: Keyframe, type: EasingType) => void
  copyKf?:        () => void
  cutKf?:         () => void
  duplicateKf?:   (kf: Keyframe) => void
  deleteKf?:      () => void
  /** Snap kf.timeMs to the nearest frame boundary. */
  alignToFrame?:  () => void
  /** Toggle hold easing (convenience — common workflow). */
  convertToHold?: (kf: Keyframe) => void
  /** Mirror selected keyframes' times within their bounding window. */
  mirrorTiming?:  () => void
  /** Change the keyframe's tangent linkage mode (Sprint 3). */
  setTangentMode?: (kf: Keyframe, mode: TangentMode) => void
  /** Cross-panel: jump to the same kf in the OTHER view. */
  showInOther?:   () => void
  showInOtherLabel?: string   // 'Show in Curve Editor' / 'Show in Dope Sheet'
}

/** Single-keyframe menu — same surface in both panels. */
export function buildKeyframeMenu(
  kf:      Keyframe,
  h:       KeyframeMenuHandlers,
  /** Multi-select size — toggles plural labels + disables single-kf rows. */
  selCount = 1,
): MenuItem[] {
  const multi = selCount > 1
  return [
    action(multi ? `Edit Value (${selCount})…` : 'Edit Value…',  undefined, h.editValue && (() => h.editValue!(kf)), multi),
    action(multi ? `Edit Time (${selCount})…`  : 'Edit Time…',   undefined, h.editTime  && (() => h.editTime!(kf)),  multi),
    sep(),
    {
      kind: 'submenu', label: 'Interpolation',
      items: EASING_TYPES.map((t) =>
        action(prettyEasing(t), undefined, h.setEasing && (() => h.setEasing!(kf, t)))),
    },
    {
      kind: 'submenu', label: 'Tangent Mode',
      // Only meaningful for customBezier easing — disabled otherwise so the
      // user sees the option exists but understands when it applies.
      disabled: kf.easing?.type !== 'customBezier',
      items: [
        action('Broken',  undefined, h.setTangentMode && (() => h.setTangentMode!(kf, 'broken'))),
        action('Aligned', undefined, h.setTangentMode && (() => h.setTangentMode!(kf, 'aligned'))),
        // TODO(big-feature): Auto / Linear modes — auto requires a tangent
        //   solver (Catmull-Rom / Bessel), linear flattens the segment.
        action('Auto (soon)',   undefined, undefined, true),
        action('Linear (soon)', undefined, undefined, true),
      ],
    },
    sep(),
    action('Mirror Timing', undefined, h.mirrorTiming, selCount < 2),
    sep(),
    action('Copy',          '⌘C', h.copyKf),
    action('Cut',           '⌘X', h.cutKf),
    action('Duplicate',     '⌘D', h.duplicateKf && (() => h.duplicateKf!(kf))),
    action('Delete',        '⌫',  h.deleteKf),
    sep(),
    action('Align to Frame', undefined, h.alignToFrame),
    action('Convert to Hold', undefined, h.convertToHold && (() => h.convertToHold!(kf))),
    ...(h.showInOther ? [sep(), action(h.showInOtherLabel ?? 'Show in Other View', undefined, h.showInOther)] : []),
  ]
}

export interface EmptyAreaHandlers {
  setPlayheadHere?: () => void
  pasteAtCursor?:   () => void
  addMarkerHere?:   () => void
  setWorkAreaStart?: () => void
  setWorkAreaEnd?:   () => void
  fitAll?:           () => void
  fitSelected?:      () => void
  selectAfterHere?:  () => void
  selectBeforeHere?: () => void
}

export function buildEmptyAreaMenu(h: EmptyAreaHandlers): MenuItem[] {
  return [
    action('Set Playhead Here',  undefined, h.setPlayheadHere),
    action('Paste Keyframes Here', '⌘V',    h.pasteAtCursor),
    action('Add Marker Here',    undefined, h.addMarkerHere),
    sep(),
    action('Set Work Area Start', undefined, h.setWorkAreaStart),
    action('Set Work Area End',   undefined, h.setWorkAreaEnd),
    sep(),
    action('Select Keyframes After This Time',  undefined, h.selectAfterHere),
    action('Select Keyframes Before This Time', undefined, h.selectBeforeHere),
    sep(),
    action('Fit Selected', 'F', h.fitSelected),
    action('Fit All',      'A', h.fitAll),
  ]
}

export interface SegmentHandlers {
  addKeyframeHere?: () => void
  setLinear?:       () => void
  setEaseIn?:       () => void
  setEaseOut?:      () => void
  setEaseInOut?:    () => void
  setHold?:         () => void
  flatten?:         () => void
}

/** Curve segment menu — only meaningful in Curve Editor. */
export function buildSegmentMenu(h: SegmentHandlers): MenuItem[] {
  return [
    action('Add Keyframe Here', undefined, h.addKeyframeHere),
    sep(),
    action('Set Segment Linear',  undefined, h.setLinear),
    action('Set Segment Ease In', undefined, h.setEaseIn),
    action('Set Segment Ease Out', undefined, h.setEaseOut),
    action('Set Segment Ease In Out', undefined, h.setEaseInOut),
    action('Set Segment Hold',    undefined, h.setHold),
    sep(),
    action('Flatten Segment', undefined, h.flatten),
  ]
}

export interface PropertyRowHandlers {
  addKeyframeAtPlayhead?: () => void
  deleteAllKeyframes?:    () => void
  selectAllKeyframes?:    () => void
  clearAnimation?:        () => void
  copyAnimation?:         () => void
  pasteAnimation?:        () => void
  showInCurveEditor?:     () => void
  hideFromCurveEditor?:   () => void
}

export function buildPropertyRowMenu(h: PropertyRowHandlers, isShownInCurves: boolean): MenuItem[] {
  return [
    action('Add Keyframe at Playhead', undefined, h.addKeyframeAtPlayhead),
    action('Select All Keyframes',     undefined, h.selectAllKeyframes),
    sep(),
    action('Copy Animation',  '⌘C', h.copyAnimation),
    action('Paste Animation', '⌘V', h.pasteAnimation),
    sep(),
    action('Delete All Keyframes', undefined, h.deleteAllKeyframes),
    action('Clear Animation',      undefined, h.clearAnimation),
    sep(),
    isShownInCurves
      ? action('Hide from Curve Editor', undefined, h.hideFromCurveEditor)
      : action('Show in Curve Editor',   undefined, h.showInCurveEditor),
  ]
}

// ── Internal helpers ────────────────────────────────────────────────────────

function action(
  label:    string,
  shortcut: string | undefined,
  handler:  (() => void) | undefined,
  forceDisabled = false,
): MenuItem {
  return {
    kind: 'action',
    label,
    shortcut,
    disabled: forceDisabled || handler == null,
    onSelect: handler ?? noop,
  }
}

function sep(): MenuItem { return { kind: 'separator' } }
function noop() { /* disabled rows never call this */ }

function prettyEasing(t: EasingType): string {
  switch (t) {
    case 'linear':       return 'Linear'
    case 'hold':         return 'Hold'
    case 'easeIn':       return 'Ease In'
    case 'easeOut':      return 'Ease Out'
    case 'easeInOut':    return 'Ease In/Out'
    case 'customBezier': return 'Custom Bezier…'
    default: return t
  }
}
