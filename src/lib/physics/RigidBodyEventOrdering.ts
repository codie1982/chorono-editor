/**
 * Compare portable rigid body ids with deterministic UTF-16 code-unit order.
 *
 * The solver and Worker boundary must use the same punctuation-sensitive
 * ordering. Locale collation is deliberately excluded because it can treat
 * hyphens and underscores differently from `Array.sort()` and can vary across
 * runtimes. Equal ids return zero; callers still validate uniqueness.
 */
export function compareRigidBodyIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
