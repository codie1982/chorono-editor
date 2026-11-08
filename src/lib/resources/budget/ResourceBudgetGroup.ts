import type { ResourceAllocator, ResourceCategory, ResourceReservation } from './types'

/**
 * Applies one owner's charge to multiple independent limits (for example local
 * PCM and the editor-wide limit). These scopes overlap and must not be summed.
 * Admission/growth succeeds in every limit or rolls back partial charges. Idle
 * owner cleanup protects every scope before invoking the one disposal callback;
 * a failure cannot leave another scope willing to reclaim uncertain storage.
 * No resource data, platform handles or new eviction algorithm is owned here.
 */
export class ResourceBudgetGroup implements ResourceAllocator {
  private readonly allocators: readonly ResourceAllocator[]
  constructor(allocators: readonly ResourceAllocator[]) {
    if (!allocators.length) throw new RangeError('A resource budget group needs at least one allocator.')
    this.allocators = Array.from(new Set(allocators))
  }

  /** Reserve in all supplied scopes before allocation. On refusal the owner's
   * partial tickets are released; already reclaimed idle data stays released. */
  reserve(category: ResourceCategory, bytes: number): ResourceReservation | null {
    const tickets: ResourceReservation[] = []
    try {
      for (const allocator of this.allocators) {
        const ticket = allocator.reserve(category, bytes)
        if (!ticket) { tickets.forEach(item => item.release()); return null }
        tickets.push(ticket)
      }
    } catch (error) { tickets.forEach(item => item.release()); throw error }
    const protect = () => tickets.forEach(item => item.protect())
    return {
      get bytes() { return tickets[0].bytes }, get state() { return tickets[0].state },
      resize: next => {
        const old = tickets[0].bytes
        const changed: ResourceReservation[] = []
        try {
          for (const ticket of tickets) {
            if (!ticket.resize(next)) { changed.forEach(item => item.resize(old)); return false }
            changed.push(ticket)
          }
        } catch (error) { changed.forEach(item => item.resize(old)); throw error }
        return true
      },
      commit: () => tickets.forEach(item => item.commit()), protect,
      allowReclaim: dispose => tickets.forEach(item => item.allowReclaim(() => { protect(); dispose() })),
      touch: () => tickets.forEach(item => item.touch()),
      release: () => tickets.forEach(item => item.release()),
    }
  }
}
