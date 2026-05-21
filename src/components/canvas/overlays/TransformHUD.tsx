// ── Transform HUD ─────────────────────────────────────────────────────────
// Floats near the cursor during a drag, showing the live numeric value
// (X/Y for move, angle for rotate, W/H for resize, anchor coords for anchor).
// Pinned to the viewport (position: fixed) so it stays visible regardless
// of canvas scroll/pan.
interface TransformHUDProps {
  x: number; y: number
  label: string
}
export function TransformHUD({ x, y, label }: TransformHUDProps) {
  return (
    <div
      className="fixed pointer-events-none z-[100] px-2 py-1 rounded text-[11px] font-mono
                 bg-gray-900/90 text-white border border-gray-700 shadow-lg whitespace-nowrap"
      style={{ left: x + 16, top: y + 16 }}
    >
      {label}
    </div>
  )
}
