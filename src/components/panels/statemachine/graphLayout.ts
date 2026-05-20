// ── SM graph geometry (BL-09 Sprint 3) ──────────────────────────────────────
// Pure helpers for the SVG node-graph editor: node sizing, auto-layout for
// unpositioned states, and bezier edge/label maths. Kept free of React so the
// geometry is unit-testable in isolation.

export const NODE_W = 132
export const NODE_H = 56
const HALF_W = NODE_W / 2
const HALF_H = NODE_H / 2

export interface NodePos { x: number; y: number } // centre point

/**
 * Deterministic grid auto-layout for a state at list `index`. Used when a state
 * has no stored x/y so freshly added states never stack on top of each other.
 */
export function autoLayoutPos(index: number): NodePos {
  const COLS = 3
  const col = index % COLS
  const row = Math.floor(index / COLS)
  return { x: 110 + col * 200, y: 80 + row * 130 }
}

/** Resolve a state's centre: its stored position, or the auto-layout fallback. */
export function statePos(state: { x?: number; y?: number }, index: number): NodePos {
  return typeof state.x === 'number' && typeof state.y === 'number'
    ? { x: state.x, y: state.y }
    : autoLayoutPos(index)
}

/** Point where the line centre→towards exits the node's rectangle border. */
export function borderPoint(centre: NodePos, towards: NodePos): NodePos {
  const dx = towards.x - centre.x
  const dy = towards.y - centre.y
  if (dx === 0 && dy === 0) return centre
  const scaleX = dx !== 0 ? HALF_W / Math.abs(dx) : Infinity
  const scaleY = dy !== 0 ? HALF_H / Math.abs(dy) : Infinity
  const scale = Math.min(scaleX, scaleY)
  return { x: centre.x + dx * scale, y: centre.y + dy * scale }
}

/** Horizontal control-handle offset for a smooth S-curve between two nodes. */
function handle(a: NodePos, b: NodePos): number {
  return Math.max(40, Math.abs(b.x - a.x) * 0.5)
}

/** Cubic bezier path string connecting two node borders. */
export function edgePath(from: NodePos, to: NodePos): string {
  const a = borderPoint(from, to)
  const b = borderPoint(to, from)
  const cp = handle(a, b)
  return `M ${a.x} ${a.y} C ${a.x + cp} ${a.y}, ${b.x - cp} ${b.y}, ${b.x} ${b.y}`
}

/** The cubic-bezier midpoint (t=0.5) — used to anchor the edge label. */
export function edgeMidpoint(from: NodePos, to: NodePos): NodePos {
  const a = borderPoint(from, to)
  const b = borderPoint(to, from)
  const cp = handle(a, b)
  const c1 = { x: a.x + cp, y: a.y }
  const c2 = { x: b.x - cp, y: b.y }
  return {
    x: 0.125 * a.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * b.x,
    y: 0.125 * a.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * b.y,
  }
}

/** Self-transition loop drawn above the node. */
export function selfLoopPath(p: NodePos): string {
  const y = p.y - HALF_H
  return `M ${p.x - 22} ${y} C ${p.x - 56} ${y - 64}, ${p.x + 56} ${y - 64}, ${p.x + 22} ${y}`
}

/** Label anchor for a self-loop. */
export function selfLoopLabel(p: NodePos): NodePos {
  return { x: p.x, y: p.y - HALF_H - 50 }
}

/** Hit-test: is point (px,py) inside the node rectangle centred at `pos`? */
export function hitNode(pos: NodePos, px: number, py: number): boolean {
  return Math.abs(px - pos.x) <= HALF_W && Math.abs(py - pos.y) <= HALF_H
}

/** SVG canvas size that comfortably contains all node positions. */
export function canvasBounds(positions: NodePos[]): { width: number; height: number } {
  let maxX = 400
  let maxY = 300
  for (const p of positions) {
    maxX = Math.max(maxX, p.x + NODE_W)
    maxY = Math.max(maxY, p.y + NODE_H + 70)
  }
  return { width: maxX + 40, height: maxY + 40 }
}
