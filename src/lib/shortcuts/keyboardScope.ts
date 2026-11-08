/** Portalled keyboard scopes block source editing only while presented.
 * Retained hidden/aria-hidden menus and closed native dialogs do not disable
 * editor shortcuts. Rects reflect display:none/disconnection; the helper reads
 * DOM synchronously and owns no focus, listeners, cached nodes or other state.
 * Call from browser keyboard adapters, not numerical/domain services. */
export function hasVisibleKeyboardScope(): boolean {
  const scopes = document.querySelectorAll?.('[role="menu"], [role="dialog"], [aria-modal="true"], dialog[open]') ?? []
  return Array.from(scopes).some(scope => !scope.closest('[hidden], [aria-hidden="true"]')
    && !(scope.tagName === 'DIALOG' && !scope.hasAttribute('open')) && scope.getClientRects().length > 0)
}
