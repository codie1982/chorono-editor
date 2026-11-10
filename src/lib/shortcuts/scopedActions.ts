type ActionOwner = { actions: Readonly<Record<string, () => void>>; available: () => boolean }
const owners = new Set<ActionOwner>()

/** Panel-local commands use the central keyboard listener. Registration owns no
 * DOM listener/focus; availability is checked at invocation, so a hidden dock
 * cannot handle a bookmark command. Dispose on unmount/dependency replacement. */
export function registerScopedActions(actions: Readonly<Record<string, () => void>>, available: () => boolean): () => void {
  const owner = { actions, available }; owners.add(owner)
  return () => { owners.delete(owner) }
}

/** Latest presented owner wins; no fallback to a hidden retained panel. */
export function scopedShortcutAction(id: string): (() => void) | undefined {
  return Array.from(owners).reverse().find(owner => owner.actions[id] && owner.available())?.actions[id]
}
