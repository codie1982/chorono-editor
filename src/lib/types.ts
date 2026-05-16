// ── Compatibility shim ────────────────────────────────────────────────────────
// This file existed before the types/ split. All exports are now in types/.
// Old imports pointing at '@/lib/types' continue to work unchanged.

export * from './types/index'

// ── Legacy alias ──────────────────────────────────────────────────────────────
// The old InterpolationType is replaced by EasingType. Keep the alias so any
// remaining usages compile until the evaluator migration in Sprint 0 Step 5.
export type { EasingType as InterpolationType } from './types/core'
