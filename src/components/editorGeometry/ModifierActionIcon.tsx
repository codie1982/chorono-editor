/** Small feature-owned action glyph. The enclosing native button supplies its
 * accessible label, tooltip and keyboard focus; the SVG is decoration only. */
export function ModifierActionIcon({ action }: { action: 'apply' | 'remove' | 'up' | 'down' }) {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {action === 'up' ? <path d="m6 14 6-6 6 6" /> : action === 'down' ? <path d="m6 10 6 6 6-6" /> : action === 'apply' ? <path d="m5 12 4 4L19 6" /> : <>
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
    </>}
  </svg>
}
