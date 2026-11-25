interface SoloModeOverlayProps {
  active: boolean
}

/** Persistent editor-only Solo feedback. Mount directly in the untransformed
 * viewport so the yellow frame and label stay fixed through pan/zoom/fullscreen.
 * Pointer-transparent chrome never captures gestures or enters rendered exports.
 * Playback retains the indicator because visual Solo filtering remains active.
 */
export function SoloModeOverlay({ active }: SoloModeOverlayProps) {
  if (!active) return null
  return <div data-solo-mode-overlay className="pointer-events-none absolute inset-0 z-[60] border-[3px] border-yellow-400">
    <div role="status" aria-label="Solo mode active"
      className="absolute bottom-3 left-3 rounded bg-yellow-400 px-2.5 py-1 text-[11px] font-bold tracking-wider text-gray-950 shadow">
      SOLO
    </div>
  </div>
}
