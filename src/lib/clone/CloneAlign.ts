// ── CloneAlign (BL-59 Phase 2) ────────────────────────────────────────────────
//
// "Clone & Align to selected targets" — 3ds Max-style multi-target clone.
//
// Workflow:
//   1. User selects ONE source layer + N target layers.
//   2. Source is cloned for each target.
//   3. Each clone's transform is aligned to its target (position; optionally
//      rotation and scale).
//
// Use cases:
//   - Place an icon at every marker
//   - Replicate a card at each grid placeholder
//   - Stamp a symbol on every selected node
//
// Pure math — no scene mutation. The command layer wraps this in
// makeCloneAlignCmd (commands-clone.ts).

import type { Layer } from '../types'

export interface CloneAlignOptions {
  /** Match target's x/y (default true). */
  alignPosition: boolean
  /** Copy target.rotation onto clone (default false). */
  matchRotation: boolean
  /** Copy target.scaleX / scaleY onto clone (default false). */
  matchScale: boolean
  /** Optional per-clone offset applied AFTER alignment. */
  offsetX: number
  offsetY: number
  /** Delete the target layer after the clone replaces it. */
  replaceTarget: boolean
}

export function defaultCloneAlignOptions(): CloneAlignOptions {
  return {
    alignPosition: true,
    matchRotation: false,
    matchScale: false,
    offsetX: 0,
    offsetY: 0,
    replaceTarget: false,
  }
}

export interface CloneAlignSpec {
  /** The target layer (provides the destination transform). */
  target: Layer
  /** Final transform values to apply to the new clone. */
  position: { x: number; y: number }
  rotation: number
  scaleX: number
  scaleY: number
}

/**
 * For every target, compute the transform the cloned source should land
 * at. Returns one spec per target; the command layer then runs the
 * actual clone and writes the transform.
 *
 * Targets that ARE the source (passed in by mistake) are skipped — you
 * never clone-and-align a layer onto itself.
 */
export function resolveCloneAlignSpecs(
  source: Layer,
  targets: Layer[],
  options: CloneAlignOptions,
): CloneAlignSpec[] {
  const out: CloneAlignSpec[] = []
  for (const target of targets) {
    if (target.id === source.id) continue

    const position = options.alignPosition
      ? {
          x: target.transform.x + options.offsetX,
          y: target.transform.y + options.offsetY,
        }
      : {
          x: source.transform.x + options.offsetX,
          y: source.transform.y + options.offsetY,
        }

    const rotation = options.matchRotation
      ? target.transform.rotationDeg
      : source.transform.rotationDeg

    const scaleX = options.matchScale
      ? target.transform.scaleX
      : source.transform.scaleX
    const scaleY = options.matchScale
      ? target.transform.scaleY
      : source.transform.scaleY

    out.push({ target, position, rotation, scaleX, scaleY })
  }
  return out
}
