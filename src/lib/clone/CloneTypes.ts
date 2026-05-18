// ── Clone Types (BL-59) ───────────────────────────────────────────────────────
//
// Type definitions for the Clone & Array System. Used by CloneSingleLayer,
// CloneTreeResolver, and the commands-clone factories.
//
// Design (v2):
//   - CloneMode covers 4 future modes; MVP only implements 'copy'.
//   - CloneMetadata is stored OUTSIDE the Layer object (in EditorState.
//     layerMetaById) so scene JSON exports stay clean.
//   - CloneResult / CloneTreeResult always carry an `idMap` so the caller
//     can remap references (parentId, mask targets, track targets, etc.).

import type { Layer } from '../types'

// ── Modes ────────────────────────────────────────────────────────────────────

/**
 * How the clone relates to its source.
 *
 *   copy       — Full deep clone, independent layer. No live link.
 *                (MVP — implemented)
 *   instance   — Shares geometry/style with source; independent transform.
 *                Editing source updates all instances. (Phase 2 — needs
 *                asset/symbol system)
 *   reference  — Thin wrapper, observes source; specific properties can be
 *                overridden per-clone. (Phase 2)
 *   virtual    — Procedural (computed on render), zero physical storage.
 *                Implemented via Repeater Modifier. (Phase 2)
 */
export type CloneMode = 'copy' | 'instance' | 'reference' | 'virtual'

// ── Metadata ─────────────────────────────────────────────────────────────────

/**
 * Per-clone metadata kept in EditorState.layerMetaById (NOT on the Layer
 * object itself). Lets the UI show "Source: X", "Clone of Y", "Unarray"
 * etc. without polluting scene JSON.
 */
export interface CloneMetadata {
  /** Layer id of the source the clone was derived from. */
  sourceId: string
  /** Which CloneMode was used (always 'copy' in MVP). */
  mode: CloneMode
  /** Unix epoch ms — useful for sorting and "recent clones" UI. */
  createdAt: number
  /**
   * Optional grouping handle — all clones produced by a single Array
   * operation share the same arrayGroupId. Lets "Select All Instances"
   * find siblings in O(scene.layers.length).
   */
  arrayGroupId?: string
}

// ── Options ──────────────────────────────────────────────────────────────────

export interface CloneOptions {
  /** Defaults to 'copy'. Future modes throw NotImplementedError. */
  mode?: CloneMode
  /**
   * Translate the clone by (offsetX, offsetY) in the source's local space.
   * Default 0, 0 (clone overlaps source exactly).
   */
  offsetX?: number
  offsetY?: number
  /** Optional name override. Defaults to "{source.name} Copy". */
  nameOverride?: string
  /** Optional arrayGroupId to attach to the clone's metadata. */
  arrayGroupId?: string
}

// ── Results ──────────────────────────────────────────────────────────────────

/**
 * Result of cloning a single layer (no children).
 *
 * The `idMap` will always have exactly one entry: { [source.id]: clone.id }.
 * It is provided as a Record (instead of returning just the new id) so
 * callers can use the same code path that handles tree clones — remapping
 * via Object.entries(idMap).
 */
export interface CloneResult {
  clonedLayer: Layer
  /** oldId → newId mapping. For single-layer clones: one entry. */
  idMap: Record<string, string>
  /** Editor metadata to attach via EditorState.layerMetaById. */
  metadata: CloneMetadata
}

/**
 * Result of cloning a layer tree (root + all descendants).
 *
 * Used when the source is a group (or any layer that has children pointing
 * at it via parentId). The `idMap` contains one entry per cloned node;
 * callers MUST use it to remap track targets, mask references, etc., so
 * the new subtree is fully self-contained.
 */
export interface CloneTreeResult {
  /** The root of the cloned subtree. */
  clonedRoot: Layer
  /** All cloned layers in the subtree, in tree-order (root first). */
  allClones: Layer[]
  /** oldId → newId mapping for EVERY node in the subtree. */
  idMap: Record<string, string>
  /** Per-clone metadata, keyed by NEW layer id. */
  metadata: Record<string, CloneMetadata>
}
