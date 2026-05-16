'use client'
import { useEffect, useRef, useState } from 'react'
import { _onToastEmit, _onToastDismiss, type ToastMessage, type ToastKind } from '@/lib/toast/toast'

/**
 * Mount once at the React root. Subscribes to the global toast emitter and
 * renders a stack of dismissable cards in the bottom-right corner.
 *
 * Sticky messages (duration: 0) only disappear on user click.
 */
export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  // Keep timer handles so we can clear on early dismiss
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // ── Subscribe to emits ──────────────────────────────────────────────────
  useEffect(() => {
    const unsub = _onToastEmit((msg) => {
      setToasts(prev => [...prev, msg])
      if (msg.duration > 0) {
        const handle = setTimeout(() => dismiss(msg.id), msg.duration)
        timersRef.current.set(msg.id, handle)
      }
    })
    const unsubDismiss = _onToastDismiss((id) => dismiss(id))
    return () => { unsub(); unsubDismiss() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dismiss = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const handle = timersRef.current.get(id)
    if (handle) {
      clearTimeout(handle)
      timersRef.current.delete(id)
    }
  }

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  )
}

// ── Single toast card ─────────────────────────────────────────────────────────

const ICONS: Record<ToastKind, string> = {
  info:    'ℹ',
  success: '✓',
  warning: '⚠',
  error:   '✕',
}

const KIND_CLASSES: Record<ToastKind, string> = {
  info:    'border-blue-500/60    bg-blue-950/95   text-blue-100',
  success: 'border-emerald-500/60 bg-emerald-950/95 text-emerald-100',
  warning: 'border-amber-500/60   bg-amber-950/95  text-amber-100',
  error:   'border-red-500/60     bg-red-950/95    text-red-100',
}

const ICON_CLASSES: Record<ToastKind, string> = {
  info:    'bg-blue-500/30    text-blue-300',
  success: 'bg-emerald-500/30 text-emerald-300',
  warning: 'bg-amber-500/30   text-amber-300',
  error:   'bg-red-500/30     text-red-300',
}

function ToastItem({ toast: t, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className={`pointer-events-auto flex items-start gap-2 px-3 py-2 rounded-lg border shadow-2xl
        animate-[dock-leaf-in_240ms_ease-out] ${KIND_CLASSES[t.kind]}`}
    >
      <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center
        text-[13px] font-bold ${ICON_CLASSES[t.kind]}`}>
        {ICONS[t.kind]}
      </span>
      <div className="flex-1 min-w-0 text-[12px] leading-snug">
        <div className="font-medium">{t.message}</div>
        {t.detail && (
          <div className="text-[11px] opacity-75 mt-0.5">{t.detail}</div>
        )}
        {t.action && (
          <button
            onClick={() => { t.action!.onClick(); onDismiss() }}
            className="mt-1.5 text-[11px] underline opacity-90 hover:opacity-100"
          >
            {t.action.label}
          </button>
        )}
      </div>
      <button
        onClick={onDismiss}
        title="Dismiss"
        className="shrink-0 text-[14px] leading-none opacity-50 hover:opacity-100 transition-opacity"
      >
        ×
      </button>
    </div>
  )
}
