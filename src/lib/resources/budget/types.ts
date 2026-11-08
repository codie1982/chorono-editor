export const RESOURCE_CATEGORIES = ['scratch', 'preview', 'image', 'video', 'audio', 'font', 'gpu', 'derived', 'input'] as const
export type ResourceCategory = typeof RESOURCE_CATEGORIES[number]
export type ReservationState = 'reserved' | 'resident' | 'released'

/** One owner's unique allocation charge, never the source asset/scene itself.
 * Acquire before allocation, commit after success, protect while in use, and
 * release AFTER physical disposal. Idle callbacks must dispose their resource
 * and release this handle synchronously. No URL, DOM or GPU payload is exposed. */
export interface ResourceReservation {
  readonly bytes: number
  readonly state: ReservationState
  resize(bytes: number): boolean
  commit(): void
  protect(): void
  allowReclaim(dispose: () => void): void
  touch(): void
  release(): void
}
/** Minimal owner dependency. null is an admission refusal, never permission to
 * allocate outside the budget. Invalid category/size requests throw RangeError. */
export interface ResourceAllocator {
  reserve(category: ResourceCategory, bytes: number): ResourceReservation | null
}
export interface ResourceCategoryUsage { residentBytes: number; reservedBytes: number; reclaimableBytes: number; entries: number }
export interface ResourceBudgetSnapshot {
  maxBytes: number; maxEntries: number; chargedBytes: number; residentBytes: number; reservedBytes: number
  protectedBytes: number; reclaimableBytes: number; availableBytes: number; peakBytes: number; entries: number
  admissions: number; denials: number; reclaims: number; reclaimFailures: number
  categories: Record<ResourceCategory, ResourceCategoryUsage>
}
