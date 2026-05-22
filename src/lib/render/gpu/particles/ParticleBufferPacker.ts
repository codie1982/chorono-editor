// ── ParticleBufferPacker ────────────────────────────────────────────────────────
//
// Serializes already-evaluated ParticleInstances into a flat Float32Array laid
// out for instanced GPU upload. One particle = 11 floats (44 bytes):
//
//   offset  size  attribute      meaning
//   ------  ----  ------------   ---------------------------------------------
//   0       2     a_position     layer-local x, y (px)
//   2       1     a_size         diameter = baseSize * currentScale
//   3       1     a_rotation     radians
//   4       1     a_opacity      layerAlpha * currentOpacity (0-1)
//   5       4     a_color        r, g, b, a normalized 0-1
//   9       1     a_shapeId      0-8 (see SHAPE_ID)
//   10      1     a_shapeParam   star: innerRatio; others: 0
//
// The staging buffer grows on demand (×1.5 headroom) and is reused across
// frames — no per-frame allocation in the hot path.

import type { ParticleInstance } from '@/lib/particles/runtime/ParticleInstance'
import type { ParticleEmitterData, ParticleShape } from '@/lib/particles/types'

export const FLOATS_PER_PARTICLE = 11

const SHAPE_ID: Record<ParticleShape, number> = {
  circle:      0,
  softCircle:  1,
  rect:        2,
  roundedRect: 3,
  line:        4,
  triangle:    5,
  star:        6,
  smokePuff:   7,
  flameBlob:   8,
}

export function shapeToId(shape: ParticleShape): number {
  return SHAPE_ID[shape] ?? 0
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export class ParticleBufferPacker {
  private buffer: Float32Array = new Float32Array(0)

  /** Current staging buffer (may be larger than the live particle count). */
  getBuffer(): Float32Array {
    return this.buffer
  }

  private ensureCapacity(particleCount: number): void {
    const needed = particleCount * FLOATS_PER_PARTICLE
    if (this.buffer.length < needed) {
      this.buffer = new Float32Array(Math.ceil(needed * 1.5))
    }
  }

  /**
   * Packs alive particles into the staging buffer.
   * @returns the number of particles written; draw buffer.subarray(0, n * 11).
   */
  pack(
    instances:    ParticleInstance[],
    cfg:          ParticleEmitterData,
    relativeTime: number,
    layerAlpha:   number,
  ): number {
    this.ensureCapacity(instances.length)
    const buf = this.buffer
    const starInner = cfg.particle.starInnerRatio ?? 0.4

    let count = 0
    for (const p of instances) {
      if (!p.isAlive(relativeTime)) continue

      const base = count * FLOATS_PER_PARTICLE
      buf[base + 0] = p.currentPosition.x
      buf[base + 1] = p.currentPosition.y
      buf[base + 2] = p.baseSize * p.currentScale
      buf[base + 3] = (p.currentRotation * Math.PI) / 180
      buf[base + 4] = clamp01(layerAlpha * p.currentOpacity)

      const c = p.currentColor
      buf[base + 5] = c.r / 255
      buf[base + 6] = c.g / 255
      buf[base + 7] = c.b / 255
      buf[base + 8] = c.a / 255

      buf[base + 9]  = shapeToId(p.shape)
      buf[base + 10] = p.shape === 'star' ? starInner : 0

      count++
    }
    return count
  }
}
