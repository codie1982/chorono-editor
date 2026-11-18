/** Dock surface for the existing trajectory editor. It owns no keys, drafts or
 * transport; MotionPathOverlay portals the same controls into this host. A
 * stable callback exposes tab mount/unmount without polling or DOM discovery.
 * Switching tabs never serializes UI state into the source or Undo history. */
export function MotionKeysPanel({ active, layerName, controlsRef }: {
  active: boolean
  layerName?: string
  controlsRef: (element: HTMLDivElement | null) => void
}) {
  return <section data-panel="motionKeys" aria-label="Motion Keys panel" className="h-full min-h-0 overflow-y-auto bg-gray-900 text-gray-200">
    <header className="border-b border-gray-700 px-3 py-2 text-xs">Motion Keys{active && layerName ? ` · ${layerName}` : ''}</header>
    {!active && <p className="p-3 text-xs leading-relaxed text-gray-400">Right-click an object in the viewport and choose Edit motion keys.</p>}
    <div ref={controlsRef} />
  </section>
}
