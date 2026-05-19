// ── ParticlePool ───────────────────────────────────────────────────────────────
//
// Object pool — keeps dead ParticleInstances in a free list and re-initialises
// them instead of allocating new objects. Reduces GC pressure at high emission
// rates (160+ particles). V1: optional; V2: recommended.

import { ParticleInstance, type ParticleInstanceParams } from './ParticleInstance'

export class ParticlePool {
  private free: ParticleInstance[] = []

  /** Return a particle (from pool if available, else freshly constructed). */
  acquire(params: ParticleInstanceParams): ParticleInstance {
    const p = this.free.pop()
    return p ? p.reset(params) : new ParticleInstance(params)
  }

  /** Return a dead particle to the pool. Caller must stop referencing it. */
  release(p: ParticleInstance): void {
    this.free.push(p)
  }

  /** Release multiple particles at once. */
  releaseAll(particles: ParticleInstance[]): void {
    for (const p of particles) this.free.push(p)
  }

  /** Current pool depth (useful for debugging). */
  get freeCount(): number { return this.free.length }

  /** Drain the pool (e.g. after a scene change). */
  clear(): void { this.free.length = 0 }
}
