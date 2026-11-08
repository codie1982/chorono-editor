export interface DocumentFilePickerOptions {
  accept: string
  multiple?: boolean
  getDocumentSignal?: () => AbortSignal
  onFiles(files: File[]): void
}

/** Open a native picker bound to its initiating document. Selection/cancellation
 * detaches callbacks and removes its temporarily attached hidden input. Late
 * selection after reset cannot start IO in the replacement document. Standalone
 * hosts may omit identity; editor callers supply the stable runtime getter.
 * This function reads file metadata only; actual IO/admission belongs downstream. */
export function openDocumentFilePicker(options: DocumentFilePickerOptions): void {
  const scope = options.getDocumentSignal?.()
  if (scope?.aborted) return
  const input = document.createElement('input')
  input.type = 'file'; input.accept = options.accept; input.multiple = options.multiple ?? false; input.hidden = true
  const detach = () => {
    input.onchange = null; input.oncancel = null
    scope?.removeEventListener('abort', detach)
    input.remove()
  }
  input.oncancel = detach
  input.onchange = () => {
    const files = Array.from(input.files ?? [])
    detach()
    if (scope && (scope.aborted || options.getDocumentSignal?.() !== scope)) return
    if (files.length) options.onFiles(files)
  }
  scope?.addEventListener('abort', detach, { once: true })
  if (scope?.aborted) { detach(); return }
  // Keep a strong native/DOM owner while the picker is open. A detached input
  // can be collected or lose its backend node before chooser delivery.
  document.body.append(input)
  try { input.click() } catch (error) { detach(); throw error }
}
