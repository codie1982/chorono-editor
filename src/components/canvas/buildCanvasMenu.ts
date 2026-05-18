// ── Canvas right-click menu builder ─────────────────────────────────────────
// Translates a target Layer + a set of caller-provided handlers into the
// declarative MenuItem[] shape consumed by <ContextMenu />.
//
// Keep this file pure (no React, no DOM access) — it's pulled into both the
// canvas and the layer panel so the same menu shape can be reused if we want
// a layer-list right-click later.

import type { Layer } from '@/lib/types'
import { ANIMATABLE_PROPERTIES } from '@/lib/types'
import type { MenuItem } from '@/components/ui/ContextMenu'

export interface CanvasMenuHandlers {
  // Clipboard
  cut?:        () => void
  copy?:       () => void
  paste?:      () => void
  duplicate?:  () => void

  // BL-59 — Clone & Array System
  /** Quick clone with default offset (one new layer, opens no modal). */
  cloneQuick?:    () => void
  /** Opens CloneModal — full settings dialog. */
  cloneSettings?: () => void
  /** Opens ArrayModal — Linear/Grid/Radial dialog. */
  arraySettings?: () => void
  /** Select every layer sharing this layer's arrayGroupId. */
  selectAllInArray?: () => void
  /** True when the right-clicked layer has an arrayGroupId. */
  isArrayMember?: boolean
  /** Clone & Align: source clones one per selected target sibling. */
  cloneAlignToSelected?: () => void
  /** Bake an existing Repeater layer back into real cloned layers. */
  bakeRepeater?: () => void
  /** True when the right-clicked layer is a Repeater wrapper. */
  isRepeater?: boolean

  // Layer ops
  group?:      () => void
  ungroup?:    () => void
  deleteLayer?:() => void

  // Origin / animation
  centerOrigin?:    () => void
  animateProperty?: (propertyPath: string) => void

  // Motion path / conversion (placeholders for SVGator-parity, may be soon)
  setMotionPath?:   () => void
  convertToPath?:   () => void
  saveToLibrary?:   () => void
  createClippingPath?: () => void
  createMask?:      () => void

  // Z-order
  bringForward?:  () => void
  bringToFront?:  () => void
  sendBackward?:  () => void
  sendToBack?:    () => void

  // Lock
  toggleLock?:    () => void

  // Transform
  rotate90CW?:    () => void
  rotate90CCW?:   () => void
  flipHorizontal?:() => void
  flipVertical?:  () => void

  // Align (only meaningful with multi-select — caller decides)
  alignLeft?:   () => void
  alignCenter?: () => void
  alignRight?:  () => void
  alignTop?:    () => void
  alignMiddle?: () => void
  alignBottom?: () => void
  distributeHorizontally?: () => void
  distributeVertically?:   () => void
}

export interface BuildMenuArgs {
  layer:        Layer            // primary right-clicked layer
  multiCount:   number           // size of the current selection
  canUngroup:   boolean          // true when at least one selected layer is a group
  canPaste:     boolean
  handlers:     CanvasMenuHandlers
}

/**
 * Compose the full menu structure. Items whose handler is `undefined` get
 * a stub onSelect that does nothing AND the row is disabled — this way the
 * menu always shows the full surface area while clearly marking which
 * features aren't wired yet (avoids the "is this hidden or missing?" trap).
 */
export function buildCanvasMenu(args: BuildMenuArgs): MenuItem[] {
  const h         = args.handlers
  const isGroup   = args.canUngroup
  const multi     = args.multiCount > 1
  const isLocked  = args.layer.locked === true

  return [
    // ── Copy / Paste submenu ───────────────────────────────────────────────
    {
      kind: 'submenu', label: 'Copy / Paste',
      items: [
        action('Cut',       '⌘X', h.cut),
        action('Copy',      '⌘C', h.copy),
        action('Paste',     '⌘V', h.paste, !args.canPaste),
        action('Duplicate', '⌘D', h.duplicate),
      ],
    },

    // ── BL-59 Clone & Array submenu ────────────────────────────────────────
    {
      kind: 'submenu', label: 'Clone / Array',
      items: [
        action('Clone (quick)',    '⌥⌘D', h.cloneQuick ?? h.duplicate),
        action('Clone with settings…', undefined, h.cloneSettings),
        sep(),
        action('Array…',           '⇧⌘A', h.arraySettings),
        action(
          'Clone & Align to selected targets',
          undefined,
          h.cloneAlignToSelected,
          !multi,
        ),
        sep(),
        action(
          'Bake Repeater to layers',
          undefined,
          h.bakeRepeater,
          !h.isRepeater,
        ),
        action(
          'Select all instances in array',
          undefined,
          h.selectAllInArray,
          !h.isArrayMember,
        ),
      ],
    },

    action('Group',       '⌘G',     h.group,   !multi),
    action('Ungroup',     '⇧⌘G',   h.ungroup,  !isGroup),
    action('Delete',      '⌫',      h.deleteLayer),

    sep(),

    action('Center origin', '⇧⌘O', h.centerOrigin),

    // ── Animate submenu — every animatable property for this layer type ───
    {
      kind: 'submenu', label: 'Animate',
      items: buildAnimateSubmenu(args.layer, h.animateProperty),
    },

    action('Set motion path',  undefined, h.setMotionPath),
    action('Convert to Spline', undefined, h.convertToPath),
    action('Save to library',  undefined, h.saveToLibrary),

    sep(),

    action('Create clipping path', undefined, h.createClippingPath),
    action('Create mask',          undefined, h.createMask),

    sep(),

    // ── Align (multi-select only) ─────────────────────────────────────────
    {
      kind: 'submenu', label: 'Align', disabled: !multi,
      items: [
        action('Align Left',    undefined, h.alignLeft),
        action('Align Center',  undefined, h.alignCenter),
        action('Align Right',   undefined, h.alignRight),
        action('Align Top',     undefined, h.alignTop),
        action('Align Middle',  undefined, h.alignMiddle),
        action('Align Bottom',  undefined, h.alignBottom),
        sep(),
        action('Distribute Horizontally', undefined, h.distributeHorizontally, args.multiCount < 3),
        action('Distribute Vertically',   undefined, h.distributeVertically,   args.multiCount < 3),
      ],
    },

    // ── Arrange (z-order) ─────────────────────────────────────────────────
    {
      kind: 'submenu', label: 'Arrange',
      items: [
        action('Bring forward',  '⌘↑',  h.bringForward),
        action('Bring to front', '⇧⌘↑', h.bringToFront),
        action('Send backward',  '⌘↓',  h.sendBackward),
        action('Send to back',   '⇧⌘↓', h.sendToBack),
      ],
    },

    action(isLocked ? 'Unlock' : 'Lock', '⌘L', h.toggleLock),

    sep(),

    action('Rotate 90° right', undefined, h.rotate90CW),
    action('Rotate 90° left',  undefined, h.rotate90CCW),

    sep(),

    action('Flip horizontal', undefined, h.flipHorizontal),
    action('Flip vertical',   undefined, h.flipVertical),
  ]
}

// ── Internal builders ───────────────────────────────────────────────────────

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
function noop() { /* placeholder — disabled rows never call this */ }

/** Animate submenu — only properties that apply to THIS layer type. */
function buildAnimateSubmenu(
  layer: Layer,
  animateProperty?: (path: string) => void,
): MenuItem[] {
  // Group → category headers (separator + items) to match the screenshot
  const allowed = ANIMATABLE_PROPERTIES.filter(
    (p) => !p.layerTypes || p.layerTypes.includes(layer.type),
  )
  const byGroup = new Map<string, typeof allowed>()
  for (const p of allowed) {
    const arr = byGroup.get(p.group) ?? []
    arr.push(p)
    byGroup.set(p.group, arr)
  }
  const out: MenuItem[] = []
  let first = true
  for (const [, items] of Array.from(byGroup.entries())) {
    if (!first) out.push(sep())
    first = false
    for (const p of items) {
      out.push(action(p.label, undefined, animateProperty ? () => animateProperty(p.path) : undefined))
    }
  }
  return out
}
