// ── Canvas right-click menu builder ─────────────────────────────────────────
// Translates a target Layer + a set of caller-provided handlers into the
// declarative MenuItem[] shape consumed by <ContextMenu />.
//
// Keep this file pure (no React, no DOM access) — it's pulled into both the
// canvas and the layer panel so the same menu shape can be reused if we want
// a layer-list right-click later.

import type { Layer } from '@/lib/types'
import { ANIMATABLE_PROPERTIES, isPropertyAnimatableOn } from '@/lib/types'
import { keyableChannels } from '@/lib/timeline/authoring/keyableChannels'
import type { MenuItem } from '@/components/ui/ContextMenu'
import { buildAddLayerMenu } from '@/components/layers/add/buildAddLayerMenu'
import { itemDetailMenu } from '@/components/detail/detailMenu'

export interface CanvasMenuHandlers {
  /** Main editor Add dispatcher; absent in private detail hosts. */
  addLayer?: (kind: string, origin?: { x: number; y: number }) => void
  editContent?: () => void
  isolateSelection?: () => void
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
  /** BL-67 — Enter motion path pick mode: the next path layer clicked on the
   *  canvas becomes this layer's followPath target. Auto-creates a
   *  followPath.progress 0→1 animation across the layer's lifetime. */
  assignMotionPath?: () => void
  /** Enter the clicked object's existing viewport trajectory editor. UI-only;
   * caller selects the target and supplies the active Timeline context. */
  editMotionKeys?: () => void
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
  /** Atomic selection-wide lock, distinct from the single-target handler. */
  toggleSelectionLock?: () => void

  // Transform
  rotate90CW?:    () => void
  rotate90CCW?:   () => void
  flipHorizontal?:() => void
  flipVertical?:  () => void

  // Align (only meaningful with multi-select — caller decides)
  fitParent?: () => void
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
  /** Complete selection for common-property animation filtering. A multi
   * selection without this scope omits Animate rather than using one layer. */
  selectedLayers?: readonly Layer[]
}

/**
 * Compose the full menu structure. Items whose handler is `undefined` get
 * a stub onSelect that does nothing AND the row is disabled — this way the
 * menu always shows the full surface area while clearly marking which
 * features aren't wired yet (avoids the "is this hidden or missing?" trap).
 * Multiple selection has an explicit menu: target-only commands must not be
 * exposed there. Animate lists only properties supported by every member.
 */
export function buildCanvasMenu(args: BuildMenuArgs): MenuItem[] {
  const h         = args.handlers
  const isGroup   = args.canUngroup
  const multi     = args.multiCount > 1
  const isLocked  = args.layer.locked === true

  if (multi) return buildMultipleSelectionMenu(args)

  return [
    ...itemDetailMenu(args.layer, args.multiCount, h.editContent, h.isolateSelection),
    // ── Copy / Paste submenu ───────────────────────────────────────────────
    {
      kind: 'submenu', label: 'Copy / Paste',
      items: [
        action(multi ? `Cut ${args.multiCount} layers` : 'Cut', '⌘X', h.cut),
        action(multi ? `Copy ${args.multiCount} layers` : 'Copy', '⌘C', h.copy),
        action('Paste',     '⌘V', h.paste, !args.canPaste),
        action(multi ? `Duplicate ${args.multiCount} layers` : 'Duplicate', '⌘D', h.duplicate),
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

    ...(multi && h.group ? [action('Group', '⌘G', h.group)] : []),
    ...(!multi && isGroup && h.ungroup ? [action('Ungroup', '⇧⌘G', h.ungroup)] : []),
    action(multi ? `Delete ${args.multiCount} layers` : 'Delete', '⌫', h.deleteLayer),

    sep(),

    action('Center origin', '⇧⌘O', h.centerOrigin, multi),

    // ── Animate submenu — every animatable property for this layer type ───
    {
      kind: 'submenu', label: 'Animate', disabled: multi,
      items: buildAnimateSubmenu(args.layer, h.animateProperty),
    },
    ...(h.editMotionKeys ? [action('Edit motion keys', undefined, h.editMotionKeys)] : []),

    // BL-67 — Pick a path layer on the canvas to drive this layer's position.
    action('Assign motion path…', undefined,
      args.layer.type === 'path' || multi ? undefined : h.assignMotionPath),
    action('Convert to Spline', undefined, h.convertToPath, multi),
    action('Save to library',  undefined, h.saveToLibrary, multi),

    sep(),

    action('Create clipping path', undefined, h.createClippingPath, multi),
    action('Create mask',          undefined, h.createMask, multi),

    sep(),

    // ── Align (multi-select only) ─────────────────────────────────────────
    buildAlignMenu(args),

    // ── Arrange (z-order) ─────────────────────────────────────────────────
    {
      kind: 'submenu', label: 'Arrange', disabled: multi,
      items: [
        action('Bring forward',  '⌘↑',  h.bringForward),
        action('Bring to front', '⇧⌘↑', h.bringToFront),
        action('Send backward',  '⌘↓',  h.sendBackward),
        action('Send to back',   '⇧⌘↓', h.sendToBack),
      ],
    },

    action(isLocked ? 'Unlock' : 'Lock', '⌘L', h.toggleLock, multi),

    sep(),

    action('Rotate 90° right', undefined, h.rotate90CW, multi),
    action('Rotate 90° left',  undefined, h.rotate90CCW, multi),

    sep(),

    action('Flip horizontal', undefined, h.flipHorizontal, multi),
    action('Flip vertical',   undefined, h.flipVertical, multi),
    ...(h.addLayer ? [sep(), ...buildAddLayerMenu(h.addLayer)] : []),
  ]
}

/** Selection-wide commands verified at the canvas/page integration boundary.
 * Ungroup, origin, arrange, transforms and source-specific clone actions
 * currently address only the primary/context layer and are deliberately absent.
 * Clipboard and clone handlers own the full selection; Paste owns its clipboard.
 */
function buildMultipleSelectionMenu(args: BuildMenuArgs): MenuItem[] {
  // TODO(helpers): Explain repeated Cmd/Ctrl-drag offsets near Duplicate;
  // decide help versus an explicit option before adding any UI.
  const h = args.handlers
  const layers = args.selectedLayers
  const animation = layers?.length === args.multiCount
    ? buildAnimateSubmenu(args.layer, h.animateProperty, layers) : []
  return [
    { kind: 'submenu', label: 'Copy / Paste', items: [
      action('Cut', '⌘X', h.cut), action('Copy', '⌘C', h.copy),
      action('Paste', '⌘V', h.paste, !args.canPaste), action('Duplicate', '⌘D', h.duplicate),
    ] },
    { kind: 'submenu', label: 'Clone / Array', items: [
      action('Clone (quick)', '⌥⌘D', h.cloneQuick ?? h.duplicate),
      action('Clone with settings…', undefined, h.cloneSettings),
      action('Array…', '⇧⌘A', h.arraySettings),
    ] },
    action('Group', '⌘G', h.group), action('Delete', '⌫', h.deleteLayer),
    ...(animation.length ? [sep(), { kind: 'submenu' as const, label: 'Animate', items: animation }] : []),
    sep(), buildAlignMenu(args),
    ...(h.toggleSelectionLock ? [sep(), action(layers?.every(layer => layer.locked) ? 'Unlock selection' : 'Lock selection',
      '⌘L', h.toggleSelectionLock)] : []),
  ]
}

/** Shared selection alignment surface. Distribution needs at least three members. */
function buildAlignMenu(args: BuildMenuArgs): MenuItem {
  const h = args.handlers
  const single = args.multiCount < 2
  return { kind: 'submenu', label: 'Align', disabled: single && !h.fitParent, items: [
    action('Align Left', undefined, h.alignLeft, single), action('Align Center', undefined, h.alignCenter, single),
    action('Align Right', undefined, h.alignRight, single), action('Align Top', undefined, h.alignTop, single),
    action('Align Middle', undefined, h.alignMiddle, single), action('Align Bottom', undefined, h.alignBottom, single),
    sep(), action('Distribute Horizontally', undefined, h.distributeHorizontally, args.multiCount < 3),
    action('Distribute Vertically', undefined, h.distributeVertically, args.multiCount < 3),
    ...(single && h.fitParent ? [sep(), action('Fit Parent', undefined, h.fitParent, !!args.layer.locked)] : []),
  ] }
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
  selection: readonly Layer[] = [layer],
): MenuItem[] {
  const channels = selection.length > 1 ? selection.map(member =>
    new Set(keyableChannels(member, [], 'all', new Set()).map(channel => channel.path))) : null
  const allowed = ANIMATABLE_PROPERTIES.filter(
    (p) => selection.every(member => isPropertyAnimatableOn(p, member.type))
      && (!channels || channels.every(paths => paths.has(p.path))),
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
