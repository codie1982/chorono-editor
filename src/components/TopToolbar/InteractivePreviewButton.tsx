import type { Layer } from '@/lib/types'

/** Runtime interaction preview is distinct from Timeline playback. Hide the
 * trigger when the scene has no tappable/draggable content; keep Exit available
 * while active even if the scene changes. Source/event behavior stays upstream. */
export function InteractivePreviewButton({ layers, active, onToggle }: {
  layers: readonly Layer[]; active: boolean; onToggle(): void
}) {
  if (!active && !layers.some(layer => layer.tappable || layer.draggable)) return null
  return <button onClick={onToggle} aria-pressed={active}
    title={active ? 'Exit interactive preview — return to editing' : 'Test tappable and draggable objects. Use Timeline Play for animation playback.'}
    className={`h-9 shrink-0 px-3 inline-flex items-center whitespace-nowrap rounded text-xs font-medium focus-visible:outline focus-visible:outline-blue-400 ${active ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}>
    {active ? 'Exit interaction' : 'Interact'}
  </button>
}
