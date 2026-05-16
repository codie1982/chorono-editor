// ── Toast Emitter ─────────────────────────────────────────────────────────────
//
// Tiny pub-sub for in-app toast notifications. Call `toast.info(...)` from
// anywhere; <ToastContainer> at the React root subscribes and renders.
//
// No React dep, no Context — works from outside the component tree (e.g. in
// callbacks, async handlers, error boundaries).

export type ToastKind = 'info' | 'success' | 'warning' | 'error'

export interface ToastMessage {
  id:       string
  kind:     ToastKind
  message:  string
  /** Auto-dismiss after this many ms. 0 = sticky (user must close). */
  duration: number
  /** Optional supporting line (smaller text under the main message). */
  detail?:  string
  /** Optional action button on the toast. */
  action?:  { label: string; onClick: () => void }
  /** When the toast was emitted (epoch ms) — used for de-duping. */
  createdAt: number
}

type Listener = (t: ToastMessage) => void
type Dismisser = (id: string) => void

const listeners  = new Set<Listener>()
const dismissers = new Set<Dismisser>()

function emit(
  kind: ToastKind,
  message: string,
  opts: { duration?: number; detail?: string; action?: ToastMessage['action'] } = {},
): string {
  const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const msg: ToastMessage = {
    id,
    kind,
    message,
    duration:  opts.duration ?? (kind === 'error' ? 6000 : 3500),
    detail:    opts.detail,
    action:    opts.action,
    createdAt: Date.now(),
  }
  listeners.forEach(fn => fn(msg))
  return id
}

export const toast = {
  info:    (msg: string, opts?: Parameters<typeof emit>[2]) => emit('info',    msg, opts),
  success: (msg: string, opts?: Parameters<typeof emit>[2]) => emit('success', msg, opts),
  warning: (msg: string, opts?: Parameters<typeof emit>[2]) => emit('warning', msg, opts),
  error:   (msg: string, opts?: Parameters<typeof emit>[2]) => emit('error',   msg, opts),
  dismiss: (id: string) => { dismissers.forEach(fn => fn(id)) },
}

/** Internal — used by <ToastContainer>. */
export function _onToastEmit(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Internal — programmatic dismiss requests. */
export function _onToastDismiss(fn: Dismisser): () => void {
  dismissers.add(fn)
  return () => { dismissers.delete(fn) }
}
