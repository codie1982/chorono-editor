// ── 2D Affine Transformation Matrix ───────────────────────────────────────────
//
// Stored as 6 numbers (a, b, c, d, e, f) representing the matrix:
//
//   ⎡ a  c  e ⎤
//   ⎢ b  d  f ⎥
//   ⎣ 0  0  1 ⎦
//
// This is the same layout the DOM / Canvas / SVG APIs use, so it composes
// cleanly with ctx.setTransform() and `transform="matrix(a b c d e f)"`.
//
// All methods are PURE — they return a new Matrix2D, never mutate `this`.

import type { Vec2 } from './CoordinateSystem'

export class Matrix2D {
  constructor(
    public readonly a: number,
    public readonly b: number,
    public readonly c: number,
    public readonly d: number,
    public readonly e: number,
    public readonly f: number,
  ) {}

  // ── Factories ───────────────────────────────────────────────────────────────

  static identity(): Matrix2D {
    return new Matrix2D(1, 0, 0, 1, 0, 0)
  }

  static translation(tx: number, ty: number): Matrix2D {
    return new Matrix2D(1, 0, 0, 1, tx, ty)
  }

  static scale(sx: number, sy: number = sx): Matrix2D {
    return new Matrix2D(sx, 0, 0, sy, 0, 0)
  }

  /** Rotation by `deg` degrees (clockwise, screen convention). */
  static rotation(deg: number): Matrix2D {
    const r = (deg * Math.PI) / 180
    const c = Math.cos(r)
    const s = Math.sin(r)
    return new Matrix2D(c, s, -s, c, 0, 0)
  }

  static skewX(deg: number): Matrix2D {
    return new Matrix2D(1, 0, Math.tan((deg * Math.PI) / 180), 1, 0, 0)
  }

  static skewY(deg: number): Matrix2D {
    return new Matrix2D(1, Math.tan((deg * Math.PI) / 180), 0, 1, 0, 0)
  }

  // ── Composition ─────────────────────────────────────────────────────────────

  /**
   * Returns `this * other`. The combined matrix first applies `other`, then
   * `this` (post-multiplication; matches CSS/SVG transform chain semantics).
   */
  multiply(other: Matrix2D): Matrix2D {
    return new Matrix2D(
      this.a * other.a + this.c * other.b,
      this.b * other.a + this.d * other.b,
      this.a * other.c + this.c * other.d,
      this.b * other.c + this.d * other.d,
      this.a * other.e + this.c * other.f + this.e,
      this.b * other.e + this.d * other.f + this.f,
    )
  }

  /**
   * Inverse matrix. Throws if the matrix is singular (determinant ≈ 0).
   * Used to map world → local coordinates during hit-testing.
   */
  invert(): Matrix2D {
    const det = this.a * this.d - this.b * this.c
    if (Math.abs(det) < 1e-9) {
      throw new Error('Matrix2D.invert: singular matrix (determinant ≈ 0)')
    }
    const invDet = 1 / det
    return new Matrix2D(
       this.d * invDet,
      -this.b * invDet,
      -this.c * invDet,
       this.a * invDet,
      (this.c * this.f - this.d * this.e) * invDet,
      (this.b * this.e - this.a * this.f) * invDet,
    )
  }

  /** Multiply by a translation on the right (post-translation). */
  translate(tx: number, ty: number): Matrix2D {
    return this.multiply(Matrix2D.translation(tx, ty))
  }

  /** Multiply by a rotation on the right. */
  rotate(deg: number): Matrix2D {
    return this.multiply(Matrix2D.rotation(deg))
  }

  /** Multiply by a scale on the right. */
  scale(sx: number, sy: number = sx): Matrix2D {
    return this.multiply(Matrix2D.scale(sx, sy))
  }

  // ── Application ─────────────────────────────────────────────────────────────

  /** Apply this matrix to a point. Returns a NEW Vec2. */
  applyToPoint(p: Vec2): Vec2 {
    return {
      x: this.a * p.x + this.c * p.y + this.e,
      y: this.b * p.x + this.d * p.y + this.f,
    }
  }

  /** Apply only the linear part (rotation + scale + skew, no translation). */
  applyToVector(v: Vec2): Vec2 {
    return {
      x: this.a * v.x + this.c * v.y,
      y: this.b * v.x + this.d * v.y,
    }
  }

  // ── Inspection ──────────────────────────────────────────────────────────────

  /** Returns true if this matrix is approximately the identity (within ε). */
  isIdentity(eps = 1e-9): boolean {
    return (
      Math.abs(this.a - 1) < eps &&
      Math.abs(this.b)     < eps &&
      Math.abs(this.c)     < eps &&
      Math.abs(this.d - 1) < eps &&
      Math.abs(this.e)     < eps &&
      Math.abs(this.f)     < eps
    )
  }

  /** Determinant. Useful for cycle/degenerate detection. */
  determinant(): number {
    return this.a * this.d - this.b * this.c
  }

  /** Decompose into translate / rotate / scale components, assuming the
   *  matrix has NO shear (built from Translate × Rotate × Scale, the convention
   *  Chorono layers follow). Rotation returned in degrees, range (-180, 180].
   *  Used by makeUngroupCmd (BL-03) to bake a group's transform into children. */
  decompose(): { x: number; y: number; rotation: number; scaleX: number; scaleY: number } {
    // Translation lives in (e, f)
    const x = this.e
    const y = this.f
    // Column 1 length = scaleX (assuming no shear)
    const scaleX = Math.hypot(this.a, this.b)
    // Column 2 length × sign-of-det → scaleY (preserve reflection via det sign)
    const det = this.a * this.d - this.b * this.c
    const rawScaleY = Math.hypot(this.c, this.d)
    const scaleY = det < 0 ? -rawScaleY : rawScaleY
    // Rotation = angle of column 1 vector (a, b)
    const rotation = (Math.atan2(this.b, this.a) * 180) / Math.PI
    return { x, y, rotation, scaleX, scaleY }
  }

  /** Returns [a, b, c, d, e, f] — matches DOMMatrix / ctx.setTransform args. */
  toArray(): [number, number, number, number, number, number] {
    return [this.a, this.b, this.c, this.d, this.e, this.f]
  }

  /** Stable JSON-friendly representation. */
  toJSON(): { a: number; b: number; c: number; d: number; e: number; f: number } {
    return { a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f }
  }

  /**
   * Applies this matrix to a 2D canvas context. Combines with the current
   * canvas transform (ctx.transform()) — does NOT reset.
   */
  applyToCanvas(ctx: CanvasRenderingContext2D): void {
    ctx.transform(this.a, this.b, this.c, this.d, this.e, this.f)
  }

  /** Replaces the canvas transform entirely (ctx.setTransform). */
  setOnCanvas(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(this.a, this.b, this.c, this.d, this.e, this.f)
  }
}
