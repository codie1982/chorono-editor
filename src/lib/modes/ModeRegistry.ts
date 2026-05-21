// ── ModeRegistry ──────────────────────────────────────────────────────────────
// Singleton registry of all registered ModeDescriptors.
// Modes register themselves at startup; the editor reads from the registry
// instead of hardcoding per-mode logic in page.tsx.

import type { ModeDescriptor } from '@/lib/core/ModeDescriptor'
import type { EditorMode } from '@/lib/core/EditorMode'

class ModeRegistryClass {
  private readonly _descriptors = new Map<EditorMode, ModeDescriptor>()

  /** Register a mode. Safe to call multiple times with the same mode id. */
  register(descriptor: ModeDescriptor): void {
    this._descriptors.set(descriptor.mode, descriptor)
  }

  /** Look up a descriptor. Throws if the mode has not been registered. */
  get(mode: EditorMode): ModeDescriptor {
    const desc = this._descriptors.get(mode)
    if (!desc) throw new Error(`[ModeRegistry] mode '${mode}' is not registered`)
    return desc
  }

  /** Returns true when a descriptor for `mode` has been registered. */
  has(mode: EditorMode): boolean {
    return this._descriptors.has(mode)
  }

  /** All registered descriptors in registration order. */
  all(): ModeDescriptor[] {
    return Array.from(this._descriptors.values())
  }
}

export const modeRegistry = new ModeRegistryClass()
