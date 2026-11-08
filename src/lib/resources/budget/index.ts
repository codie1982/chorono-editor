import { ResourceBudget } from './ResourceBudget'
export { ResourceBudget } from './ResourceBudget'
export { ResourceBudgetGroup } from './ResourceBudgetGroup'
export type { ResourceAllocator, ResourceReservation, ResourceBudgetSnapshot, ResourceCategory } from './types'

/** Composition root for registered editor owners. This is one 512 MiB ledger,
 * not one limit per cache and not a claim about total browser/process memory. */
export const editorResourceBudget = new ResourceBudget({ maxBytes: 512 * 1024 ** 2, maxEntries: 4096 })
