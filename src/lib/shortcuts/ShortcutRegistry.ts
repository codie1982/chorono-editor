import type { ShortcutDefinition, ShortcutContext, KeyBinding } from './ShortcutDefinition'

export class ShortcutRegistry {
  private shortcuts: Map<string, ShortcutDefinition> = new Map()

  register(def: ShortcutDefinition): void {
    this.shortcuts.set(def.id, def)
  }

  registerAll(defs: ShortcutDefinition[]): void {
    for (const def of defs) this.register(def)
  }

  getAll(): ShortcutDefinition[] {
    return Array.from(this.shortcuts.values())
  }

  getById(id: string): ShortcutDefinition | undefined {
    return this.shortcuts.get(id)
  }

  getByContext(context: ShortcutContext): ShortcutDefinition[] {
    return this.getAll().filter(
      (d) => d.contexts.includes(context) || d.contexts.includes('global'),
    )
  }

  /** Find a matching shortcut id for a keyboard event in the given context.
   *  Returns the first match; context-specific bindings are checked before global. */
  resolve(event: KeyboardEvent, activeContext: ShortcutContext): string | null {
    const key = event.key.toLowerCase()
    const meta = event.metaKey || event.ctrlKey
    const shift = event.shiftKey
    const alt = event.altKey

    // Context-specific first, then global fallback
    const candidates = [
      ...this.getAll().filter(
        (d) => d.contexts.includes(activeContext) && !d.contexts.includes('global'),
      ),
      ...this.getAll().filter((d) => d.contexts.includes('global')),
    ]

    for (const def of candidates) {
      if (def.binding.type !== 'keyboard') continue
      const b = def.binding as KeyBinding
      if (
        b.key === key &&
        !!b.meta === meta &&
        !!b.shift === shift &&
        !!b.alt === alt
      ) {
        return def.id
      }
    }
    return null
  }

  /** Human-readable shortcut string for display, e.g. "⌘ D" or "Ctrl + D" */
  displayString(id: string, isMac = false): string {
    const def = this.shortcuts.get(id)
    if (!def || def.binding.type !== 'keyboard') return ''
    const b = def.binding as KeyBinding
    const parts: string[] = []
    if (b.meta) parts.push(isMac ? '⌘' : 'Ctrl')
    if (b.shift) parts.push(isMac ? '⇧' : 'Shift')
    if (b.alt) parts.push(isMac ? '⌥' : 'Alt')
    parts.push(b.key === ' ' ? 'Space' : b.key.length === 1 ? b.key.toUpperCase() : b.key)
    return parts.join(isMac ? '' : ' + ')
  }
}

export const shortcutRegistry = new ShortcutRegistry()
