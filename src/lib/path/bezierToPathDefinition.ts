// ── BezierPath → PathDefinition Converter (BL-59 Phase 2) ─────────────────────
//
// Bridges the user-facing BezierPath (anchors + in/out handles) onto the
// normalized PathDefinition (M / L / C / Q / Z commands) consumed by
// PathSampler for arc-length parameterization.
//
// Conversion rules:
//   - First anchor → M (move to)
//   - Each subsequent segment:
//     * If both handles are missing/zero → L (line)
//     * Otherwise → C (cubic bezier with prev.out + curr.in as controls)
//   - When closed, append a closing segment from last → first anchor, then Z.

import type { BezierPath, PathAnchor } from '../types/path'
import type {
  PathDefinition,
  NormalizedPathCommand,
} from '../geometry'
import { M, L, C, Z } from '../geometry'

function hasHandle(anchor: PathAnchor, kind: 'in' | 'out'): boolean {
  if (kind === 'in')  return anchor.inX  != null && anchor.inY  != null
  return anchor.outX != null && anchor.outY != null
}

function buildSegment(prev: PathAnchor, curr: PathAnchor): NormalizedPathCommand {
  const hasOut = hasHandle(prev, 'out')
  const hasIn  = hasHandle(curr, 'in')
  if (!hasOut && !hasIn) {
    return L(curr.x, curr.y)
  }
  // Fall back to anchor positions if a handle is missing — produces a
  // smooth-ish cubic instead of a corner.
  const c1x = prev.outX ?? prev.x
  const c1y = prev.outY ?? prev.y
  const c2x = curr.inX  ?? curr.x
  const c2y = curr.inY  ?? curr.y
  return C(c1x, c1y, c2x, c2y, curr.x, curr.y)
}

export function bezierPathToPathDefinition(bp: BezierPath): PathDefinition {
  const commands: NormalizedPathCommand[] = []
  if (bp.anchors.length === 0) {
    return { commands, closed: false }
  }
  const first = bp.anchors[0]
  commands.push(M(first.x, first.y))
  for (let i = 1; i < bp.anchors.length; i++) {
    commands.push(buildSegment(bp.anchors[i - 1], bp.anchors[i]))
  }
  if (bp.closed && bp.anchors.length >= 3) {
    const last = bp.anchors[bp.anchors.length - 1]
    commands.push(buildSegment(last, first))
    commands.push(Z())
  }
  return { commands, closed: bp.closed }
}
