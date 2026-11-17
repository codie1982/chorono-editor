/** Hit-transparent, fixed CSS-size acquisition feedback. The point is the
 * reached geometry handle in composition pixels, never an exportable layer. */
export function SnapPointOverlay({ point, zoom, reference = false }: {
  point: { x: number; y: number }; zoom: number; reference?: boolean
}) {
  return <div data-testid={reference ? 'placement-start-reference' : 'geometry-snap-point'} data-x={point.x} data-y={point.y}
    className="absolute z-40 pointer-events-none" style={{ left: point.x * zoom, top: point.y * zoom }}>
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" className="absolute -left-[11px] -top-[11px] text-amber-300">
      <path d="M11 1v20M1 11h20" stroke="currentColor" strokeWidth="1" /><circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="2" fill="#0f172a" fillOpacity=".75" />
    </svg>
    <span className="absolute left-4 top-3 whitespace-nowrap rounded border border-amber-400/50 bg-slate-950/95 px-2 py-1 text-[10px] text-amber-200">
      {reference ? 'Draw here or choose a start point' : 'SNAP'} · {Number(point.x.toFixed(2))}, {Number(point.y.toFixed(2))}
    </span>
  </div>
}
