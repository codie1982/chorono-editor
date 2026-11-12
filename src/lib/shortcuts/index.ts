export { shortcutRegistry, ShortcutRegistry } from './ShortcutRegistry'
export type { ShortcutDefinition, ShortcutContext, Binding, KeyBinding, GestureBinding } from './ShortcutDefinition'
export { defaultBindings } from './defaultBindings'

// Pre-load the singleton with defaults on first import
import { shortcutRegistry } from './ShortcutRegistry'
import { defaultBindings } from './defaultBindings'
shortcutRegistry.registerDefaults(defaultBindings)
