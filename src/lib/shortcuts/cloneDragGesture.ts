import { shortcutRegistry, type ShortcutRegistry } from './index'

interface Modifiers { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }

/** Resolve copy/instance from the same registered gestures shown in help.
 * `meta` means platform accelerator (Cmd OR Ctrl), matching keyboard policy.
 * Alt has a registered Copy alias; plain Shift remains axis lock. More specific
 * instance bindings take precedence. Resolve only on pointer-down; neither
 * releasing nor retaining Alt/Cmd at pointer-up changes this pinned decision. */
export function resolveCloneDragMode(event: Modifiers, registry: ShortcutRegistry = shortcutRegistry): 'copy' | 'instance' | undefined {
  for (const [id, mode] of [['canvas.gesture.instanceDrag', 'instance'], ['canvas.gesture.cloneDrag', 'copy'], ['canvas.gesture.cloneDragAlt', 'copy']] as const) {
    const binding = registry.getById(id)?.binding
    if (binding?.type !== 'gesture' || binding.gesture !== 'drag') continue
    const modifiers = new Set(binding.modifiers ?? [])
    const meta = modifiers.has('meta'), ctrl = modifiers.has('ctrl')
    if ((meta ? event.metaKey || event.ctrlKey : ctrl ? event.ctrlKey && !event.metaKey : !event.metaKey && !event.ctrlKey)
        && event.shiftKey === modifiers.has('shift') && event.altKey === modifiers.has('alt')) return mode
  }
  return undefined
}
