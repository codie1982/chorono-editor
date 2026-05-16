// ── TransformStack ────────────────────────────────────────────────────────────
//
// Mutable stack of composed Matrix2D values. push() multiplies by a child's
// local transform; pop() unwinds back. Used by GroupRenderer to honour
// inherited transforms without leaking ctx.save/restore state.

import { Matrix2D } from '@/lib/geometry/Matrix2D'

export class TransformStack {
  private stack: Matrix2D[] = [Matrix2D.identity()]

  push(local: Matrix2D): void {
    const top = this.current()
    this.stack.push(top.multiply(local))
  }

  pop(): void {
    if (this.stack.length <= 1) return
    this.stack.pop()
  }

  current(): Matrix2D {
    return this.stack[this.stack.length - 1]
  }

  depth(): number {
    return this.stack.length - 1
  }

  reset(): void {
    this.stack = [Matrix2D.identity()]
  }
}
